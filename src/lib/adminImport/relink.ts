import type { CatalogEntry } from "@prisma/client";
import { mergeScheduleInto, reassignCatalogEntry } from "@/lib/catalogLink";
import { prisma } from "@/lib/prisma";
import { getMediaByIds, searchAnime, type AniListMedia } from "@/lib/anilist";
import { cacheAniListMedia } from "@/lib/catalogCache";
import { hasBlockedGenre } from "@/lib/contentPolicy";
import { backfillEarlierSeasons } from "@/lib/continuation";
import { animeSeasonOf } from "@/lib/calendarOffGrid";
import { seasonLabel, type SeasonName } from "@/lib/exploreGroups";
import { defaultImportDeps, loadAiring } from "@/lib/anilistImport";
import { ensureProduction } from "@/lib/production";
import { classifyMatch, looseKey, normalizeTitle, rankCandidates, type MatchCandidate, type ScoredCandidate } from "./matching";
import { clearCandidates, saveCandidates } from "./candidateStore";
import { loadLocalCandidates } from "./candidates";

/**
 * Obras que só existem pelo AniDB (sem `anilistId`) não têm página, não têm horário e não podem ser acompanhadas. Muitas são
 * obras que a AniList também tem, só que o título veio diferente ("Dai Ni Maku" × "2nd Season") ou a AniList ainda não
 * estava no cache quando o lote foi analisado. Aqui elas são comparadas de novo com o que já está no banco e, se `live`,
 * com a busca da AniList: o que casa com segurança passa a ser a obra da AniList (com página e episódios) e a cópia só do
 * AniDB some. O que não tem certeza fica como está, para uma pessoa decidir.
 */
export type RelinkItem = { anidbId: number; title: string; anilistId: number; candidate: string; score: number; via: "local" | "live" };
export type RelinkResult = {
  /** Entradas só do AniDB examinadas. */
  examined: number;
  /** Ligadas à obra da AniList (ou, no ensaio, as que seriam). */
  linked: RelinkItem[];
  /** Com candidato plausível mas sem certeza (ficam como estão). */
  uncertain: number;
  /** Quem ficou incerto, com o melhor candidato e o motivo (para uma pessoa decidir). */
  uncertainItems: Array<{ anidbId: number; title: string; candidate: string; anilistId: number; score: number; reason: string; via: "local" | "live" }>;
  /** Sem candidato: provavelmente a AniList não tem a obra. */
  withoutCandidate: number;
  episodes: number;
  earlierSeasons: number;
  /** Último título examinado (para continuar de onde parou com `afterTitle`) e se ainda sobram entradas depois dele. */
  lastTitle: string | null;
  hasMore: boolean;
};

const FILL_FIELDS = ["format", "kind", "season", "seasonYear", "coverImage", "bannerImage", "description", "episodes", "genres", "titleNative", "titleEnglish", "status", "startDate", "endDate"] as const;
const SEARCH_GAP_MS = 750; // a AniList aceita ~90 consultas por minuto
/** Semelhança de título que conta como "o mesmo título" (já sem maiúsculas, acentos e pontuação). */
const IDENTICAL_TITLE = 0.97;
/** Distância máxima (em temporadas do ano) para ligar sozinho quando o casamento é pelo score geral. */
const MAX_ERA_GAP = 1;
/**
 * Com título idêntico e um único candidato, o AniDB e a AniList podem discordar da temporada em que a obra estreou (filmes,
 * OVAs, séries que passam de um ano para o outro): vale até esta distância.
 */
const IDENTICAL_MAX_GAP = 3;

const SEASON_SLOT = ["WINTER", "SPRING", "SUMMER", "FALL"];

export type SureInput = { titleRomaji: string; season: string | null; seasonYear: number | null };

/**
 * Decide se o melhor candidato é a MESMA obra com segurança. Liga sozinho quando (a) o score geral é de casamento automático
 * e a época bate, ou (b) o título é idêntico, não há outro candidato com título idêntico e a época difere pouco. O ano que o
 * AniDB põe no título ("High Card (2024)") tem de ser o do candidato. `live` (busca da AniList, que devolve temporadas
 * vizinhas) só aceita título idêntico. Devolve o motivo quando não liga.
 */
export function pickSure(entry: SureInput, ranked: ScoredCandidate[], { live = false }: { live?: boolean } = {}): { best: ScoredCandidate | null; reason: string | null } {
  const best = ranked[0];
  if (!best) return { best: null, reason: "sem candidato" };
  const gap = eraGap(entry, best.candidate);
  const tag = /\(((?:19|20)\d{2})\)\s*$/.exec(entry.titleRomaji.trim());
  if (tag && best.candidate.seasonYear !== null && best.candidate.seasonYear !== Number(tag[1])) return { best, reason: `o título pede ${tag[1]} e a obra é de ${best.candidate.seasonYear}` };
  const identical = best.detail.title >= IDENTICAL_TITLE;
  if (live && !identical) return { best, reason: `título não é idêntico (${Math.round(best.detail.title * 100)}%)` };
  if (classifyMatch(ranked).state === "AUTO") {
    if (gap !== null && gap > MAX_ERA_GAP && !(identical && gap <= IDENTICAL_MAX_GAP)) return { best, reason: `época distante (${gap} temporadas)` };
    return { best, reason: null };
  }
  if (!identical) return { best, reason: `semelhança de ${Math.round(best.score * 100)}%` };
  if (ranked[1] && ranked[1].detail.title >= IDENTICAL_TITLE) return { best, reason: "mais de um candidato com o mesmo título" };
  if (gap !== null && gap > IDENTICAL_MAX_GAP) return { best, reason: `época distante (${gap} temporadas)` };
  return { best, reason: null };
}

/**
 * Quantas temporadas separam as duas obras; null quando uma delas não tem nem o ano. Se só o ano é conhecido (a AniList guarda
 * "2007-01-01" quando só sabe o ano), vale a melhor hipótese: mesmo ano = 0 e cada ano a mais conta 4 temporadas, menos as 3
 * em que a estreia ainda poderia ter cabido (dezembro × janeiro = 1).
 */
export function eraGap(a: { season: string | null; seasonYear: number | null }, b: { season: string | null; seasonYear: number | null }): number | null {
  if (a.seasonYear === null || b.seasonYear === null) return null;
  const slot = (x: { season: string | null }) => SEASON_SLOT.indexOf(x.season ?? "");
  if (slot(a) < 0 || slot(b) < 0) return Math.max(0, Math.abs(a.seasonYear - b.seasonYear) * 4 - 3);
  return Math.abs(a.seasonYear * 4 + slot(a) - (b.seasonYear * 4 + slot(b)));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** O AniDB desambigua com o ano no título ("High Card (2024)"); para a busca e a comparação isso só atrapalha. */
export function withoutYearTag(title: string): string {
  return title.replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();
}

/**
 * O nome que a plataforma mostra quando o AniDB e a AniList escrevem o MESMO título de jeitos diferentes ("Bishoujo Muzai
 * Pirates" × "Bishoujyo Muzai♡Pirates", "Ao Ashi" × "Aoashi"): o do AniDB, sem a marca de ano. Diferença só de maiúsculas ou
 * pontuação, ou um título de fato diferente ("Dai Ni Maku" × "2nd Season"), não troca nada (devolve null).
 */
export function anidbDisplayTitle(anidbTitle: string, anilistTitle: string): string | null {
  const wanted = withoutYearTag(anidbTitle);
  if (!wanted || looseKey(wanted) !== looseKey(anilistTitle)) return null;
  return normalizeTitle(wanted) === normalizeTitle(anilistTitle) ? null : wanted;
}

/** Liga a entrada do AniDB à obra da AniList. Devolve o título fixado, se o do AniDB passou a valer. */
async function linkEntry(entry: CatalogEntry, anilistId: number): Promise<string | null> {
  const target = await prisma.catalogEntry.findUnique({ where: { anilistId } });
  if (!target) {
    // A obra só existe como produção: a própria entrada do AniDB assume o `anilistId`; os episódios dela também.
    await prisma.$transaction(async (tx) => {
      await tx.catalogEntry.update({ where: { id: entry.id }, data: { anilistId, onPlatform: true } });
      await mergeScheduleInto(entry.id, entry.id, anilistId, tx);
    });
    return null;
  }
  const fill: Record<string, unknown> = {};
  for (const field of FILL_FIELDS) if (target[field] === null && entry[field] !== null) fill[field] = entry[field];
  const title = anidbDisplayTitle(entry.titleRomaji, target.titleRomaji);
  // O nome da AniList não some: vira o título alternativo (e continua achando na busca).
  const alias = title && target.titleEnglish === null ? { titleEnglish: target.titleRomaji } : {};
  await prisma.$transaction(async (tx) => {
    // O que apontava para a entrada do AniDB (identidade interna, Fase 2) passa para a obra da AniList antes de ela sair.
    await reassignCatalogEntry(entry.id, target.id, tx);
    // A entrada do AniDB sai primeiro: o `anidbId` é único e passa para a obra da AniList.
    await tx.catalogEntry.delete({ where: { id: entry.id } });
    await tx.catalogEntry.update({ where: { id: target.id }, data: { ...fill, ...alias, ...(title ? { titleRomaji: title, titleLocked: true } : {}), anidbId: entry.anidbId, onPlatform: true } });
  });
  return title;
}

/** O AniDB passa a constar na produção da obra (quando ela existe e o AniDB está livre). Nunca lança. */
async function bindProduction(anilistId: number, anidbId: number, title: string | null = null): Promise<void> {
  try {
    const production = (await prisma.production.findUnique({ where: { anilistId } })) ?? (await ensureProduction(anilistId).catch(() => null));
    if (!production || production.anidbId === anidbId || hasBlockedGenre(production.genres)) return;
    const holder = await prisma.production.findUnique({ where: { anidbId }, select: { id: true } });
    if (holder) return;
    await prisma.production.update({ where: { id: production.id }, data: { anidbId, ...(title ? { titleRomaji: title, titleLocked: true } : {}) } });
  } catch (error) {
    console.error("[relink] vínculo na produção falhou:", error);
  }
}

/** Uma obra da busca da AniList como candidato; sem temporada própria (ONA…), usa o mês de estreia. */
function candidateFromMedia(media: AniListMedia): MatchCandidate {
  let season: string | null = media.season;
  let seasonYear: number | null = media.seasonYear;
  const start = media.startDate;
  if ((!season || !seasonYear) && start?.year && start.month) {
    const derived = animeSeasonOf(new Date(Date.UTC(start.year, start.month - 1, start.day ?? 15)));
    season = derived.season;
    seasonYear = derived.year;
  } else if (!seasonYear && start?.year) {
    seasonYear = start.year; // só o ano é conhecido: ainda serve para barrar uma obra de outra época
  }
  return { id: `ce:${media.id}`, anilistId: media.id, titles: [media.title.romaji, media.title.native, media.title.english].filter((t): t is string => Boolean(t)), season, seasonYear, anidbId: null };
}

type LiveFound = { candidates: MatchCandidate[]; media: Map<number, AniListMedia> };

/**
 * Palavras do título para uma busca de reserva, da mais longa para a mais curta (só as de 5+ letras): a busca da AniList
 * não acha "Bishoujo Muzai Pirates" quando ela escreve "Bishoujyo", mas acha por "Pirates".
 */
export function fallbackQueries(title: string, max = 2): string[] {
  const words = Array.from(new Set(withoutYearTag(title).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5)));
  return words.sort((a, b) => b.length - a.length).slice(1, 1 + max);
}

async function searchLive(entry: CatalogEntry): Promise<LiveFound> {
  const titles = [entry.titleRomaji, entry.titleEnglish].filter((t): t is string => Boolean(t)).map(withoutYearTag);
  const media = new Map<number, AniListMedia>();
  const run = async (q: string) => {
    try {
      for (const m of await searchAnime(q)) media.set(m.id, m);
    } catch (error) {
      console.error(`[relink] busca "${q}" falhou:`, (error as Error).message);
    }
    await sleep(SEARCH_GAP_MS);
  };
  for (const q of Array.from(new Set(titles)).slice(0, 2)) await run(q);
  // Sem nenhum título (solto) igual entre os resultados: tenta pelas palavras mais longas do título.
  const wanted = new Set(titles.map(looseKey));
  const found = () => Array.from(media.values()).some((m) => [m.title.romaji, m.title.english, m.title.native].some((t) => t && wanted.has(looseKey(t))));
  if (!found()) {
    for (const q of fallbackQueries(entry.titleRomaji)) {
      await run(q);
      if (found()) break;
    }
  }
  // Obra da AniList que já pertence a OUTRA entrada do AniDB não é esta.
  const ids = Array.from(media.keys());
  const [entries, productions] = ids.length
    ? await Promise.all([
        prisma.catalogEntry.findMany({ where: { anilistId: { in: ids }, anidbId: { not: null } }, select: { anilistId: true, anidbId: true } }),
        prisma.production.findMany({ where: { anilistId: { in: ids }, anidbId: { not: null } }, select: { anilistId: true, anidbId: true } }),
      ])
    : [[], []];
  const owned = new Set([...entries, ...productions].filter((r) => r.anidbId !== entry.anidbId).map((r) => r.anilistId));
  return { candidates: Array.from(media.values()).filter((m) => !owned.has(m.id) && !hasBlockedGenre(m.genres)).map(candidateFromMedia), media };
}

/**
 * Compara de novo as entradas só do AniDB com o catálogo local (e, com `live`, com a busca da AniList). `dryRun` só conta
 * (nada é gravado). Casos ambíguos ou sem candidato ficam como estão.
 */
export async function relinkAnidbOnlyEntries({
  dryRun = false,
  live = false,
  limit,
  afterTitle,
  onProgress,
}: {
  dryRun?: boolean;
  live?: boolean;
  /** Examina no máximo tantas entradas (a busca ao vivo leva ~2 s por obra): o resto fica para a próxima rodada. */
  limit?: number;
  /** Continua depois deste título (o `lastTitle` da rodada anterior). */
  afterTitle?: string;
  onProgress?: (done: number, total: number, title: string) => void;
} = {}): Promise<RelinkResult> {
  const all = await prisma.catalogEntry.findMany({
    where: { source: "anidb", anilistId: null, anidbId: { not: null }, ...(afterTitle ? { titleRomaji: { gt: afterTitle } } : {}) },
    orderBy: { titleRomaji: "asc" },
    ...(limit ? { take: limit + 1 } : {}),
  });
  const entries = limit ? all.slice(0, limit) : all;
  const candidates = await loadLocalCandidates();
  const result: RelinkResult = { examined: entries.length, linked: [], uncertain: 0, uncertainItems: [], withoutCandidate: 0, episodes: 0, earlierSeasons: 0, lastTitle: entries.at(-1)?.titleRomaji ?? null, hasMore: limit !== undefined && all.length > limit };
  const taken = new Set<number>();
  const ids: number[] = [];

  const decide = (entry: CatalogEntry, pool: MatchCandidate[]) => {
    const label = entry.season && entry.seasonYear ? seasonLabel({ season: entry.season as SeasonName, year: entry.seasonYear }) : null;
    const titles = [entry.titleRomaji, entry.titleNative, entry.titleEnglish].filter((t): t is string => Boolean(t)).map(withoutYearTag);
    return rankCandidates({ sourceKey: String(entry.anidbId), titles, seasonLabel: label, year: entry.seasonYear }, pool);
  };

  for (const [index, entry] of entries.entries()) {
    onProgress?.(index, entries.length, entry.titleRomaji);
    // Obra do AniDB já ligada a outra: o candidato com outro AniDB não é "esta" obra.
    let verdict = pickSure(entry, decide(entry, candidates.filter((c) => c.anidbId === null || c.anidbId === entry.anidbId)));
    let via: RelinkItem["via"] = "local";
    let found: LiveFound | null = null;
    if (live && verdict.reason !== null) {
      found = await searchLive(entry);
      const liveVerdict = pickSure(entry, decide(entry, found.candidates), { live: true });
      // O resultado da busca vale quando é seguro, ou quando o banco local não tinha candidato nenhum.
      if (liveVerdict.reason === null || !verdict.best) {
        verdict = liveVerdict;
        via = "live";
      }
    }
    if (!verdict.best) {
      result.withoutCandidate += 1;
      continue;
    }
    const best = verdict.best.candidate;
    const genres = via === "live" ? found?.media.get(best.anilistId)?.genres.join(",") ?? null : (await prisma.catalogEntry.findUnique({ where: { anilistId: best.anilistId }, select: { genres: true } }))?.genres ?? null;
    const blocked = hasBlockedGenre(genres);
    const reason = verdict.reason ?? (blocked ? "conteúdo adulto" : taken.has(best.anilistId) ? "a obra da AniList já foi ligada a outra entrada" : null);
    if (reason !== null) {
      result.uncertain += 1;
      result.uncertainItems.push({ anidbId: entry.anidbId as number, title: entry.titleRomaji, candidate: best.titles[0] ?? `#${best.anilistId}`, anilistId: best.anilistId, score: Math.round(verdict.best.score * 100) / 100, reason, via });
      continue;
    }
    taken.add(best.anilistId);
    result.linked.push({ anidbId: entry.anidbId as number, title: entry.titleRomaji, anilistId: best.anilistId, candidate: best.titles[0] ?? `#${best.anilistId}`, score: Math.round(verdict.best.score * 100) / 100, via });
    if (dryRun) continue;
    const media = found?.media.get(best.anilistId);
    if (via === "live" && media) await cacheAniListMedia([media], { rankFromOrder: false });
    const title = await linkEntry(entry, best.anilistId);
    await bindProduction(best.anilistId, entry.anidbId as number, title);
    ids.push(best.anilistId);
  }
  onProgress?.(entries.length, entries.length, "");

  // As incertas ficam guardadas para o admin decidir (Match name); o que foi ligado sai da fila.
  if (!dryRun) {
    await saveCandidates(result.uncertainItems.filter((u) => u.reason !== "conteúdo adulto").map((u) => ({ anidbId: u.anidbId, anilistId: u.anilistId, candidateTitle: u.candidate, score: u.score, reason: u.reason })));
    await clearCandidates(result.linked.map((l) => l.anidbId));
  }

  if (!dryRun && ids.length > 0) {
    try {
      result.episodes = await loadAiring(ids, defaultImportDeps);
    } catch (error) {
      console.error("[relink] episódios não puderam ser carregados:", error);
    }
    result.earlierSeasons = await backfillEarlierSeasons();
  }
  return result;
}

/**
 * Obras que já tinham sido religadas antes de o título do AniDB ser preservado: devolve o nome do AniDB quando ele é só outra
 * grafia do da AniList (a entrada do AniDB que vinha de um lote sem par — registro "novo" — é a prova de que o nome é dele).
 */
export async function restoreAnidbTitles({ dryRun = false }: { dryRun?: boolean } = {}): Promise<{ examined: number; changed: Array<{ anilistId: number; from: string; to: string }> }> {
  const entries = await prisma.catalogEntry.findMany({
    where: { anilistId: { not: null }, anidbId: { not: null }, titleLocked: false },
    select: { id: true, anilistId: true, anidbId: true, titleRomaji: true, titleEnglish: true },
  });
  const records = await prisma.importRecord.findMany({ where: { state: "NEW", sourceKey: { in: entries.map((e) => String(e.anidbId)) } }, select: { sourceKey: true, titleRomaji: true } });
  const anidbTitle = new Map(records.map((r) => [r.sourceKey, r.titleRomaji]));
  const changed: Array<{ anilistId: number; from: string; to: string }> = [];
  for (const entry of entries) {
    const original = anidbTitle.get(String(entry.anidbId));
    const to = original ? anidbDisplayTitle(original, entry.titleRomaji) : null;
    if (!to) continue;
    changed.push({ anilistId: entry.anilistId as number, from: entry.titleRomaji, to });
    if (dryRun) continue;
    await prisma.catalogEntry.update({ where: { id: entry.id }, data: { titleRomaji: to, titleLocked: true, ...(entry.titleEnglish === null ? { titleEnglish: entry.titleRomaji } : {}) } });
    await prisma.production.updateMany({ where: { anilistId: entry.anilistId as number }, data: { titleRomaji: to, titleLocked: true } });
  }
  return { examined: entries.length, changed };
}

export type ManualLinkResult = { ok: true; title: string | null } | { ok: false; status: number; error: string };

/**
 * O admin decidiu: esta obra do AniDB (sem página) é aquela obra da AniList. Busca a obra na AniList, guarda no catálogo,
 * junta as duas (com o nome do AniDB quando é só outra grafia), liga a produção, carrega os episódios e completa as
 * temporadas anteriores de quem acompanha as seguintes.
 */
export async function linkAnidbEntryManually(anidbId: number, anilistId: number): Promise<ManualLinkResult> {
  const entry = await prisma.catalogEntry.findFirst({ where: { anidbId, anilistId: null, source: "anidb" } });
  if (!entry) return { ok: false, status: 404, error: "Esta obra do AniDB já foi ligada ou não existe mais." };
  const [owner, ownerProduction] = await Promise.all([
    prisma.catalogEntry.findUnique({ where: { anilistId }, select: { anidbId: true } }),
    prisma.production.findUnique({ where: { anilistId }, select: { anidbId: true } }),
  ]);
  if ((owner?.anidbId && owner.anidbId !== anidbId) || (ownerProduction?.anidbId && ownerProduction.anidbId !== anidbId)) {
    return { ok: false, status: 409, error: "A obra escolhida na AniList já está ligada a outra obra do AniDB." };
  }
  let media: AniListMedia | undefined;
  try {
    [media] = await getMediaByIds([anilistId], { fresh: true });
  } catch {
    return { ok: false, status: 502, error: "A AniList não respondeu agora. Tente novamente em instantes." };
  }
  if (!media) return { ok: false, status: 404, error: "Essa obra não existe na AniList." };
  if (hasBlockedGenre(media.genres)) return { ok: false, status: 422, error: "Conteúdo adulto não entra na plataforma." };
  await cacheAniListMedia([media], { rankFromOrder: false });
  const title = await linkEntry(entry, anilistId);
  await bindProduction(anilistId, anidbId, title);
  await clearCandidates([anidbId]);
  try {
    await loadAiring([anilistId], defaultImportDeps);
  } catch (error) {
    console.error("[relink] episódios não puderam ser carregados:", error);
  }
  await backfillEarlierSeasons();
  return { ok: true, title };
}
