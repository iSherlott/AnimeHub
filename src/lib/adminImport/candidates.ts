import { prisma } from "@/lib/prisma";
import type { MatchCandidate } from "./matching";

export const CATALOG_CANDIDATE_PREFIX = "ce:";

export type CandidateSource = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  season: string | null;
  seasonYear: number | null;
  anidbId: number | null;
};

export function toCandidate(id: string, p: CandidateSource): MatchCandidate {
  return {
    id,
    anilistId: p.anilistId,
    titles: [p.titleRomaji, p.titleNative, p.titleEnglish].filter((t): t is string => Boolean(t)),
    season: p.season,
    seasonYear: p.seasonYear,
    anidbId: p.anidbId,
  };
}

/** Os candidatos que já estão no banco (produções + catálogo da AniList), sem consultar a AniList. */
export async function loadLocalCandidates(): Promise<MatchCandidate[]> {
  const [productions, entries] = await Promise.all([
    prisma.production.findMany({ select: { id: true, anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, season: true, seasonYear: true, anidbId: true } }),
    prisma.catalogEntry.findMany({
      where: { anilistId: { not: null } },
      select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, season: true, seasonYear: true, anidbId: true },
    }),
  ]);
  const known = new Set(productions.map((p) => p.anilistId));
  return [
    ...productions.map((p) => toCandidate(p.id, p)),
    ...entries
      .filter((e): e is typeof e & { anilistId: number } => e.anilistId !== null && !known.has(e.anilistId))
      .map((e) => toCandidate(`${CATALOG_CANDIDATE_PREFIX}${e.anilistId}`, e)),
  ];
}
