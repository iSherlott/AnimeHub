import { prisma } from "@/lib/prisma";

/** Um passo da linha do tempo da franquia, na ordem gravada pela auditoria (Epic 45). */
export type FranchiseStep = {
  anilistId: number;
  titleRomaji: string;
  titleNative: string | null;
  kind: string | null;
  role: "MAIN" | "RELATED" | "SPECIAL";
  /** Temporada na linha principal (só MAIN). */
  season: number | null;
  seasonName: string | null;
  seasonYear: number | null;
  episodes: number | null;
  coverImage: string | null;
  current: boolean;
};

const MAX_STEPS = 300;

/**
 * A franquia da obra inteira em ordem cronológica (séries, OVA, ODA, filmes), como a auditoria a gravou. `null` quando a
 * obra ainda não foi auditada ou a franquia tem uma obra só.
 */
export async function loadFranchiseSteps(anilistId: number): Promise<FranchiseStep[] | null> {
  const self = await prisma.catalogEntry.findUnique({ where: { anilistId }, select: { franchiseKey: true, timelineOrder: true } });
  if (!self || self.franchiseKey === null || self.timelineOrder === null) return null;
  const rows = await prisma.catalogEntry.findMany({
    where: { franchiseKey: self.franchiseKey, onPlatform: true, timelineOrder: { not: null }, anilistId: { not: null } },
    orderBy: { timelineOrder: "asc" },
    take: MAX_STEPS,
    select: { anilistId: true, titleRomaji: true, titleNative: true, kind: true, timelineRole: true, timelineSeason: true, season: true, seasonYear: true, episodes: true, coverImage: true },
  });
  if (rows.length < 2) return null;
  return rows.map((r) => ({
    anilistId: r.anilistId as number,
    titleRomaji: r.titleRomaji,
    titleNative: r.titleNative,
    kind: r.kind,
    role: r.timelineRole === "MAIN" || r.timelineRole === "RELATED" ? r.timelineRole : "SPECIAL",
    season: r.timelineSeason,
    seasonName: r.season,
    seasonYear: r.seasonYear,
    episodes: r.episodes,
    coverImage: r.coverImage,
    current: r.anilistId === anilistId,
  }));
}
