import { prisma } from "@/lib/prisma";
import { getAnimeStartedInYear, getSeasonalAnime, type AniListMedia } from "@/lib/anilist";
import { cacheAniListMedia } from "@/lib/catalogCache";
import { hasBlockedGenre } from "@/lib/contentPolicy";
import { syncContinuations } from "@/lib/continuation";
import { animeSeasonOf } from "@/lib/calendarOffGrid";
import { noProgress, type ProgressReport } from "@/lib/progressJob";

/**
 * Carga das obras antigas (Epic 44): traz para a plataforma as obras que estrearam entre `from` e `to` (por padrão, antes de
 * 2000), ano a ano. Para cada ano junta a busca por temporada com a busca por data de estreia, que acha também as obras
 * antigas que a AniList guarda só com o ano. Conteúdo adulto nunca entra. Obras que já estão na plataforma ficam como estão.
 */
export const OLD_FIRST_YEAR = 1917;
export const OLD_LAST_YEAR = 1999;
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

export type OldWorksDeps = {
  fetchSeason: (season: (typeof SEASONS)[number], year: number) => Promise<AniListMedia[]>;
  fetchStartedIn: (year: number) => Promise<AniListMedia[]>;
  sleep: (ms: number) => Promise<void>;
};

export const defaultOldWorksDeps: OldWorksDeps = {
  fetchSeason: (season, year) => getSeasonalAnime(season, year, { includeBlocked: true, fresh: true }),
  fetchStartedIn: (year) => getAnimeStartedInYear(year, { includeBlocked: true, fresh: true }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type OldWorksSummary = {
  years: number;
  /** Obras diferentes que a AniList devolveu (sem adultas). */
  found: number;
  /** Entraram na plataforma agora. */
  brought: number;
  /** Já estavam na plataforma. */
  alreadyIn: number;
  /** Conteúdo adulto: recusado. */
  blocked: number;
  /** Sem temporada na AniList (só o ano): ficam com o ano da estreia. */
  yearOnly: number;
};

/** Válido quando `from` ≤ `to` e os dois estão no intervalo de antes de 2000. */
export function parseOldRange(from: unknown, to: unknown): { from: number; to: number } | null {
  const a = from === undefined ? OLD_FIRST_YEAR : Number(from);
  const b = to === undefined ? OLD_LAST_YEAR : Number(to);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < OLD_FIRST_YEAR || b > OLD_LAST_YEAR || a > b) return null;
  return { from: a, to: b };
}

/** Mês de estreia conhecido → temporada; só o ano → fica sem temporada (a obra continua achável pelo ano). */
export function seasonOfStart(media: Pick<AniListMedia, "startDate">): { season: string; seasonYear: number } | { season: null; seasonYear: number } | null {
  const start = media.startDate;
  if (!start?.year) return null;
  if (!start.month) return { season: null, seasonYear: start.year };
  const derived = animeSeasonOf(new Date(Date.UTC(start.year, start.month - 1, start.day ?? 15)));
  return { season: derived.season, seasonYear: derived.year };
}

export async function importOldWorks({ from = OLD_FIRST_YEAR, to = OLD_LAST_YEAR }: { from?: number; to?: number } = {}, deps: OldWorksDeps = defaultOldWorksDeps, report: ProgressReport = noProgress): Promise<OldWorksSummary> {
  const summary: OldWorksSummary = { years: 0, found: 0, brought: 0, alreadyIn: 0, blocked: 0, yearOnly: 0 };
  const total = to - from + 1;
  for (let year = from; year <= to; year += 1) {
    await report(`Ano ${year} (${year - from + 1} de ${total}): buscando as obras na AniList…`, year - from, total);
    const found = new Map<number, AniListMedia>();
    for (const season of SEASONS) for (const media of await deps.fetchSeason(season, year)) found.set(media.id, media);
    for (const media of await deps.fetchStartedIn(year)) if (!found.has(media.id)) found.set(media.id, media);

    const all = Array.from(found.values());
    const allowed = all.filter((m) => !hasBlockedGenre(m.genres));
    summary.blocked += all.length - allowed.length;
    summary.found += allowed.length;
    summary.years += 1;
    if (allowed.length === 0) {
      await deps.sleep(300);
      continue;
    }

    const existing = await prisma.catalogEntry.findMany({ where: { anilistId: { in: allowed.map((m) => m.id) } }, select: { anilistId: true, onPlatform: true } });
    const known = new Map(existing.map((e) => [e.anilistId as number, e.onPlatform]));
    await cacheAniListMedia(allowed.filter((m) => known.get(m.id) !== true), { rankFromOrder: false });

    // Entram na plataforma as que ainda não estavam; as sem temporada na AniList ficam com o ano (e a temporada, se o mês é conhecido).
    const toBring = allowed.filter((m) => known.get(m.id) !== true).map((m) => m.id);
    summary.alreadyIn += allowed.length - toBring.length;
    if (toBring.length > 0) {
      await prisma.catalogEntry.updateMany({ where: { anilistId: { in: toBring } }, data: { onPlatform: true } });
      summary.brought += toBring.length;
    }
    for (const media of allowed) {
      if (known.get(media.id) === true || media.season) continue;
      const derived = seasonOfStart(media);
      if (!derived) continue;
      if (!derived.season) summary.yearOnly += 1;
      await prisma.catalogEntry.updateMany({ where: { anilistId: media.id, seasonYear: null }, data: { seasonYear: derived.seasonYear, ...(derived.season ? { season: derived.season } : {}) } });
    }
    await deps.sleep(300);
  }
  await report("Procurando continuações de obras que as pessoas acompanham…", total, total);
  if (summary.brought > 0) await syncContinuations();
  await prisma.adminLog
    .create({ data: { source: "AniList", level: "INFO", event: "AniList old works", message: `${from}–${to}: ${summary.brought} obra(s) trazida(s) · ${summary.alreadyIn} já estavam · ${summary.blocked} bloqueada(s) · ${summary.yearOnly} só com o ano.`, context: "Carga das obras antigas" } })
    .catch(() => undefined);
  return summary;
}
