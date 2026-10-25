import type { EpisodeExtra, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AnidbAnime } from "@/lib/anidb";
import { EXTRA_KINDS, type ExtraKind, type ExtraView } from "@/lib/episodeExtrasView";
export { EXTRA_KINDS, type ExtraKind, type ExtraView };

/**
 * Extras do AniDB: o que não é episódio regular — especiais (S), aberturas e encerramentos (C), trailers (T), paródias (P)
 * e outros (O). Ficam numa tabela própria, fora da sequência 1, 2, 3: não contam como lançados, não entram no calendário
 * nem no sino, e não mexem no "próximo episódio". Identidade: (obra do catálogo, código do AniDB).
 */
const PREFIX: Record<string, ExtraKind> = { S: "SPECIAL", C: "CREDIT", T: "TRAILER", P: "PARODY", O: "OTHER" };
export const EXTRA_ORDER: ExtraKind[] = ["SPECIAL", "OTHER", "CREDIT", "TRAILER", "PARODY"];

export type SourceExtra = { code: string; kind: ExtraKind; number: number; title: string | null; titleEn: string | null; titleJa: string | null; airDate: Date | null };

/** Os extras de uma resposta do AniDB (códigos S1, C2, T1, P1, O1). Código repetido na mesma resposta vale uma vez. */
export function extraEpisodes(anime: Pick<AnidbAnime, "episodes">): SourceExtra[] {
  const seen = new Set<string>();
  const out: SourceExtra[] = [];
  for (const ep of anime.episodes) {
    const m = /^([SCTPO])\s*(\d+)$/i.exec(ep.number.trim());
    if (!m) continue;
    const code = `${m[1].toUpperCase()}${Number(m[2])}`;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      kind: PREFIX[m[1].toUpperCase()],
      number: Number(m[2]),
      title: ep.titles.find((t) => t.language === "x-jat")?.title ?? null,
      titleEn: ep.titles.find((t) => t.language === "en")?.title ?? null,
      titleJa: ep.titles.find((t) => t.language === "ja")?.title ?? null,
      airDate: ep.airDate ? new Date(`${ep.airDate}T00:00:00Z`) : null,
    });
  }
  return out;
}

const FIELDS = ["title", "titleEn", "titleJa", "airDate"] as const;
const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

/**
 * Grava os extras de uma obra. `fill` só completa o que está vazio; `refresh` troca o que mudou. Campo corrigido pelo
 * admin nunca muda. Um extra que a fonte deixou de listar não é apagado. Devolve quantos foram criados ou alterados.
 */
export async function upsertExtras(catalogEntryId: string, incoming: ReadonlyArray<SourceExtra>, mode: "fill" | "refresh", db: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  if (incoming.length === 0) return 0;
  const existing = new Map((await db.episodeExtra.findMany({ where: { catalogEntryId } })).map((e) => [e.code, e]));
  let written = 0;
  for (const extra of incoming) {
    const row = existing.get(extra.code);
    if (!row) {
      await db.episodeExtra.create({ data: { catalogEntryId, ...extra } });
      written += 1;
      continue;
    }
    const manual = new Set(row.manualFields);
    const data: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const value = extra[f];
      if (manual.has(f) || blank(value) || same(row[f], value) || (mode === "fill" && !blank(row[f]))) continue;
      data[f] = value;
    }
    if (Object.keys(data).length === 0) continue;
    await db.episodeExtra.update({ where: { id: row.id }, data });
    written += 1;
  }
  return written;
}

/** Leva os extras de uma obra para outra (junção AniDB → AniList): o que a de destino já tem fica e só se completa. */
export async function moveExtras(fromId: string, toId: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  if (fromId === toId) return 0;
  const rows = await db.episodeExtra.findMany({ where: { catalogEntryId: fromId } });
  for (const row of rows) {
    const twin = await db.episodeExtra.findUnique({ where: { catalogEntryId_code: { catalogEntryId: toId, code: row.code } } });
    if (twin) {
      const fill: Record<string, unknown> = {};
      for (const f of [...FIELDS, "synopsis"] as const) if (!twin.manualFields.includes(f) && blank(twin[f]) && !blank(row[f])) fill[f] = row[f];
      if (Object.keys(fill).length) await db.episodeExtra.update({ where: { id: twin.id }, data: fill });
      await db.episodeExtra.delete({ where: { id: row.id } });
    } else {
      await db.episodeExtra.update({ where: { id: row.id }, data: { catalogEntryId: toId } });
    }
  }
  return rows.length;
}

export function toExtraView(e: EpisodeExtra): ExtraView {
  return { id: e.id, code: e.code, kind: e.kind as ExtraKind, number: e.number, title: e.title, titleEn: e.titleEn, titleJa: e.titleJa, synopsis: e.synopsis, airDate: e.airDate ? e.airDate.toISOString().slice(0, 10) : null };
}

/** Extras de uma obra, na ordem: especiais e outros primeiro, depois aberturas/encerramentos, trailers e paródias. */
export async function loadExtras(work: { catalogEntryId?: string | null; anilistId?: number | null }): Promise<ExtraView[]> {
  const catalogEntryId = work.catalogEntryId ?? (work.anilistId ? (await prisma.catalogEntry.findUnique({ where: { anilistId: work.anilistId }, select: { id: true } }))?.id : null);
  if (!catalogEntryId) return [];
  const rows = await prisma.episodeExtra.findMany({ where: { catalogEntryId }, orderBy: [{ kind: "asc" }, { number: "asc" }] });
  return rows.map(toExtraView).sort((a, b) => EXTRA_ORDER.indexOf(a.kind) - EXTRA_ORDER.indexOf(b.kind) || a.number - b.number);
}
