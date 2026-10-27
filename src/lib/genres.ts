import type { Genre } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordChanges, type ChangeActor } from "@/lib/changeLog";

/**
 * Admin → Taxonomia (Fase 7, ADR 0010). O vocabulário de gêneros vive na tabela `Genre`; as obras guardam a lista em
 * `CatalogEntry.genres` e o banco aplica o vocabulário em toda gravação (gatilho `animehub_canonical_genres`): variação
 * e gênero mesclado viram o destino, gênero excluído some. O índice obra↔gênero (`CatalogGenre`) acompanha sozinho.
 * As operações daqui regravam as obras afetadas (o gatilho faz a troca), levam a mudança às cópias e registram tudo.
 */
export type GenreRow = Genre & { works: number; onPlatform: number; state: "ativo" | "não registrado" | "mesclado" | "excluído"; similar: string[] };

const comparable = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export function genreState(g: Pick<Genre, "active" | "registered" | "mergedInto">): GenreRow["state"] {
  if (g.mergedInto) return "mesclado";
  if (!g.active) return "excluído";
  return g.registered ? "ativo" : "não registrado";
}

export async function listGenres(): Promise<GenreRow[]> {
  const [genres, totals, platform] = await Promise.all([
    prisma.genre.findMany({ orderBy: [{ active: "desc" }, { position: "asc" }, { key: "asc" }] }),
    prisma.catalogGenre.groupBy({ by: ["genreKey"], _count: { _all: true } }),
    prisma.$queryRaw<Array<{ genreKey: string; n: bigint }>>`SELECT cg."genreKey", COUNT(*) AS n FROM "CatalogGenre" cg JOIN "CatalogEntry" c ON c."id" = cg."catalogEntryId" WHERE c."onPlatform" = true GROUP BY 1`,
  ]);
  const total = new Map(totals.map((t) => [t.genreKey, t._count._all]));
  const onPlatform = new Map(platform.map((p) => [p.genreKey, Number(p.n)]));
  // Duplicidade provável: dois gêneros vivos que só diferem em maiúsculas, acentos, espaços ou pontuação (ou alias).
  const live = genres.filter((g) => g.active && !g.mergedInto);
  return genres.map((g) => ({
    ...g,
    works: total.get(g.key) ?? 0,
    onPlatform: onPlatform.get(g.key) ?? 0,
    state: genreState(g),
    similar: g.active && !g.mergedInto ? live.filter((o) => o.key !== g.key && (comparable(o.key) === comparable(g.key) || o.aliases.some((a) => comparable(a) === comparable(g.key)))).map((o) => o.key) : [],
  }));
}

/** Gêneros que podem ser escolhidos numa obra (edição do admin, filtros). */
export async function activeGenreKeys(): Promise<string[]> {
  const rows = await prisma.genre.findMany({ where: { active: true, mergedInto: null, registered: true }, orderBy: [{ position: "asc" }, { key: "asc" }], select: { key: true } });
  return rows.map((r) => r.key);
}

/** Os gêneros do vocabulário sem os marcados como adultos (os favoritos do perfil, que é público). */
export async function favoriteGenreOptions(): Promise<string[]> {
  const rows = await prisma.genre.findMany({ where: { active: true, mergedInto: null, registered: true, adult: false }, orderBy: [{ position: "asc" }, { key: "asc" }], select: { key: true } });
  return rows.map((r) => r.key);
}

export async function genreWorks(key: string, page = 0, size = 50) {
  const where = { genreLinks: { some: { genreKey: key } } };
  const [total, rows] = await Promise.all([
    prisma.catalogEntry.count({ where }),
    prisma.catalogEntry.findMany({ where, orderBy: { titleRomaji: "asc" }, skip: page * size, take: size, select: { id: true, titleRomaji: true, titleNative: true, onPlatform: true, genres: true } }),
  ]);
  return { total, rows };
}

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const KEY_RE = /^[\p{L}\p{N}][\p{L}\p{N} '’-]{0,38}[\p{L}\p{N}]$/u;

async function clash(key: string, except?: string): Promise<string | null> {
  // Gênero não registrado (apareceu numa obra) não bloqueia: ele é absorvido por quem o registra como variação.
  const all = await prisma.genre.findMany({ where: { OR: [{ registered: true }, { mergedInto: { not: null } }] }, select: { key: true, aliases: true } });
  const c = comparable(key);
  const hit = all.find((g) => g.key !== except && (comparable(g.key) === c || g.aliases.some((a) => comparable(a) === c)));
  return hit ? hit.key : null;
}

export async function createGenre(input: { key: string; label?: string; description?: string | null; aliases?: string[]; adult?: boolean }, actor: ChangeActor): Promise<Result<{ genre: Genre }>> {
  const key = input.key.trim();
  if (!KEY_RE.test(key) || key.includes(",")) return { ok: false, status: 400, error: "Nome inválido: de 2 a 40 letras, números, espaço, hífen ou apóstrofo." };
  const existing = await prisma.genre.findUnique({ where: { key } });
  if (existing && existing.registered) return { ok: false, status: 409, error: `Já existe o gênero ${key}.` };
  const other = await clash(key, key);
  if (other) return { ok: false, status: 409, error: `Parecido demais com "${other}" (mesmo nome sem maiúsculas, acentos ou pontuação). Mescle em vez de criar outro.` };
  const data = { label: (input.label ?? key).trim().slice(0, 60) || key, description: input.description?.trim().slice(0, 500) || null, aliases: cleanAliases(input.aliases ?? []), adult: input.adult === true, registered: true, active: true, mergedInto: null };
  const genre = existing ? await prisma.genre.update({ where: { key }, data }) : await prisma.genre.create({ data: { key, ...data } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "Genre", entityId: key, changes: [{ field: existing ? "registered" : "created", before: existing ? false : null, after: true }] });
  return { ok: true, genre };
}

function cleanAliases(list: string[]): string[] {
  return [...new Set(list.map((a) => a.trim()).filter((a) => a && !a.includes(",") && a.length <= 40))].slice(0, 30);
}

export async function updateGenre(key: string, input: { label?: string; description?: string | null; aliases?: string[]; adult?: boolean; position?: number }, actor: ChangeActor): Promise<Result<{ genre: Genre }>> {
  const genre = await prisma.genre.findUnique({ where: { key } });
  if (!genre) return { ok: false, status: 404, error: "Gênero não encontrado." };
  if (genre.mergedInto || !genre.active) return { ok: false, status: 409, error: "Gênero mesclado ou excluído não se edita." };
  const data: Partial<Genre> = {};
  if (input.label !== undefined) data.label = input.label.trim().slice(0, 60) || genre.label;
  if (input.description !== undefined) data.description = input.description?.trim().slice(0, 500) || null;
  if (input.adult !== undefined) data.adult = input.adult;
  if (input.position !== undefined && Number.isInteger(input.position)) data.position = input.position;
  if (input.aliases !== undefined) {
    const aliases = cleanAliases(input.aliases);
    for (const a of aliases) {
      const other = await clash(a, key);
      if (other) return { ok: false, status: 409, error: `A variação "${a}" já pertence a "${other}".` };
    }
    data.aliases = aliases;
    // Variação igual a um gênero não registrado: ele passa a ser este (mesclado).
    const absorbed = await prisma.genre.findMany({ where: { registered: false, mergedInto: null, key: { in: aliases, mode: "insensitive" } }, select: { key: true } });
    for (const a of absorbed) await prisma.genre.update({ where: { key: a.key }, data: { mergedInto: key, active: false } });
  }
  const changes = Object.entries(data).filter(([f, v]) => JSON.stringify((genre as Record<string, unknown>)[f]) !== JSON.stringify(v)).map(([f, v]) => ({ field: f, before: (genre as Record<string, unknown>)[f], after: v }));
  const updated = await prisma.genre.update({ where: { key }, data: { ...data, registered: true } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "Genre", entityId: key, changes: genre.registered ? changes : [...changes, { field: "registered", before: false, after: true }] });
  // Variação nova vale também para obras que já a tinham gravada.
  if (data.aliases) await rewriteWorks(data.aliases, actor, `Variações de ${key}`, `genre-alias-${key}-${Date.now()}`);
  return { ok: true, genre: updated };
}

/** Regrava as obras (e cópias) que contêm algum dos termos: o gatilho aplica o vocabulário. Registra antes → depois. */
async function rewriteWorks(terms: string[], actor: ChangeActor, reason: string, batchId: string): Promise<number> {
  if (terms.length === 0) return 0;
  const lower = terms.map((t) => t.toLowerCase());
  const affected = await prisma.$queryRaw<Array<{ id: string; genres: string }>>`
    SELECT c."id", c."genres" FROM "CatalogEntry" c
    WHERE c."genres" IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(string_to_array(c."genres", ',')) AS t WHERE lower(btrim(t)) = ANY (${lower}))`;
  if (affected.length === 0) return 0;
  const ids = affected.map((a) => a.id);
  await prisma.$executeRaw`UPDATE "CatalogEntry" SET "genres" = "genres" WHERE "id" = ANY (${ids})`;
  const after = new Map((await prisma.catalogEntry.findMany({ where: { id: { in: ids } }, select: { id: true, genres: true } })).map((r) => [r.id, r.genres]));
  for (const a of affected) {
    await recordChanges(prisma, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: a.id, catalogEntryId: a.id, changes: [{ field: "genres", before: a.genres, after: after.get(a.id) ?? null }], reason, batchId });
  }
  // Cópias (página pública, listas, agenda) passam pelo mesmo vocabulário.
  for (const table of ["Production", "Anime", "AiringScheduleEntry"] as const) {
    await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "genres" = "animehub_canonical_genres"("genres") WHERE "genres" IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(string_to_array("genres", ',')) AS t WHERE lower(btrim(t)) = ANY ($1))`, lower);
  }
  return affected.length;
}

/** Mescla `source` em `target`: as obras passam a ter `target`; gravações futuras com `source` também. */
export async function mergeGenre(source: string, target: string, reason: string, actor: ChangeActor): Promise<Result<{ works: number }>> {
  if (source === target) return { ok: false, status: 400, error: "Escolha outro gênero de destino." };
  const [from, to] = await Promise.all([prisma.genre.findUnique({ where: { key: source } }), prisma.genre.findUnique({ where: { key: target } })]);
  if (!from) return { ok: false, status: 404, error: "Gênero não encontrado." };
  if (!to || !to.active || to.mergedInto) return { ok: false, status: 400, error: "O destino precisa ser um gênero ativo." };
  if (from.mergedInto) return { ok: false, status: 409, error: `Este gênero já foi mesclado em ${from.mergedInto}.` };
  await prisma.$transaction([
    prisma.genre.update({ where: { key: source }, data: { mergedInto: target, active: false } }),
    // Quem já tinha sido mesclado neste passa a apontar direto para o destino (sem cadeia).
    prisma.genre.updateMany({ where: { mergedInto: source }, data: { mergedInto: target } }),
  ]);
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "Genre", entityId: source, changes: [{ field: "mergedInto", before: null, after: target }], reason });
  const works = await rewriteWorks([source, ...from.aliases], actor, reason || `Mesclado em ${target}`, `genre-merge-${source}-${Date.now()}`);
  return { ok: true, works };
}

/**
 * Exclui um gênero. Com obras ligadas, exige a solução: `transfer` (as obras passam para outro gênero — é uma mesclagem)
 * ou `remove` (o gênero sai das obras, de forma explícita). Sem obras, só desativa. Nada é apagado do banco.
 */
export async function deleteGenre(key: string, input: { mode?: "transfer" | "remove"; target?: string; reason?: string }, actor: ChangeActor): Promise<Result<{ works: number }>> {
  const genre = await prisma.genre.findUnique({ where: { key } });
  if (!genre || !genre.active) return { ok: false, status: 404, error: "Gênero não encontrado." };
  const works = await prisma.catalogGenre.count({ where: { genreKey: key } });
  if (works > 0 && !input.mode) return { ok: false, status: 409, error: `${works} obra(s) têm este gênero: escolha transferir para outro gênero ou remover das obras.` };
  if (input.mode === "transfer") {
    if (!input.target) return { ok: false, status: 400, error: "Escolha o gênero de destino." };
    return mergeGenre(key, input.target, input.reason || `Excluído; obras transferidas para ${input.target}`, actor);
  }
  await prisma.genre.update({ where: { key }, data: { active: false } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "Genre", entityId: key, changes: [{ field: "active", before: true, after: false }], reason: input.reason || (works ? "Excluído e removido das obras" : "Excluído") });
  const rewritten = works ? await rewriteWorks([key, ...genre.aliases], actor, input.reason || `Gênero ${key} removido`, `genre-remove-${key}-${Date.now()}`) : 0;
  return { ok: true, works: rewritten };
}

/** Renomear a chave: cria o novo gênero com os mesmos dados e mescla o antigo nele (as obras acompanham). */
export async function renameGenreKey(key: string, newKey: string, actor: ChangeActor): Promise<Result<{ works: number }>> {
  const genre = await prisma.genre.findUnique({ where: { key } });
  if (!genre || !genre.active || genre.mergedInto) return { ok: false, status: 404, error: "Gênero não encontrado." };
  // As variações passam para o nome novo (o antigo vira uma delas, pela mesclagem).
  await prisma.genre.update({ where: { key }, data: { aliases: [] } });
  const created = await createGenre({ key: newKey, label: newKey, description: genre.description, aliases: genre.aliases, adult: genre.adult }, actor);
  if (!created.ok) {
    await prisma.genre.update({ where: { key }, data: { aliases: genre.aliases } });
    return created;
  }
  await prisma.genre.update({ where: { key: newKey }, data: { position: genre.position } });
  return mergeGenre(key, newKey, `Renomeado para ${newKey}`, actor);
}
