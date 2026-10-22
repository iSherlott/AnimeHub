import { prisma } from "@/lib/prisma";
import { sortKey } from "./franchiseOrder";
import type { FranchiseTimeline, TimelineEntry } from "./timeline";

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

/**
 * A mesma lista a partir das relações da AniList (a linha do tempo da obra), para a franquia que a auditoria ainda não
 * passou: séries da linha principal, séries relacionadas e especiais em ordem de estreia. `null` com uma obra só.
 */
export function stepsFromTimeline(timeline: FranchiseTimeline | null): FranchiseStep[] | null {
  if (!timeline) return null;
  const entries: Array<{ entry: TimelineEntry; role: FranchiseStep["role"] }> = [
    ...timeline.main.map((entry) => ({ entry, role: "MAIN" as const })),
    ...timeline.related.map((entry) => ({ entry, role: "RELATED" as const })),
    ...timeline.specials.map((entry) => ({ entry, role: "SPECIAL" as const })),
  ];
  if (entries.length < 2) return null;
  const when = (e: TimelineEntry) => sortKey({ startDate: e.startDate ? Date.parse(e.startDate) || null : null, season: e.season, seasonYear: e.seasonYear }) ?? Number.POSITIVE_INFINITY;
  return entries
    .sort((a, b) => when(a.entry) - when(b.entry) || a.entry.anilistId - b.entry.anilistId)
    .map(({ entry, role }) => ({
      anilistId: entry.anilistId,
      titleRomaji: entry.titleRomaji,
      titleNative: entry.titleNative,
      kind: entry.kind,
      role,
      season: role === "MAIN" ? (entry.seasonNumber ?? null) : null,
      seasonName: entry.season,
      seasonYear: entry.seasonYear,
      episodes: entry.episodes,
      coverImage: entry.coverImage,
      current: entry.current,
    }));
}
