import { prisma } from "@/lib/prisma";
import { findRebootCandidates, type CandidateEntry } from "./candidates";
import { linkKey } from "./versions";

/** Andamento da pesquisa de reboots e arcos (Admin → Curadoria): quantos pares já foram conferidos e o que vem a seguir. */
export type StoryCandidateRow = { key: string; a: { anilistId: number; title: string; year: number | null; episodes: number | null }; b: { anilistId: number; title: string; year: number | null; episodes: number | null } };

export type StoryReviewRow = { anilistIdA: number; anilistIdB: number; titleA: string; titleB: string; verdict: string; coverage: string | null; beyondFromEpisode: number | null; loot: string | null; reviewedAt: string };

export type StoryStatus = {
  /** Pares de séries ligados como versão alternativa na AniList (a fila inteira). */
  candidates: number;
  /** Já conferidos (reboot ou não). */
  reviewed: number;
  reboots: number;
  notReboots: number;
  /** Obras com arcos cadastrados e total de arcos. */
  worksWithArcs: number;
  arcs: number;
  /** Séries longas (26 episódios ou mais) que ainda não têm arcos, e as mais longas delas (a fila da pesquisa de arcos). */
  longWithoutArcs: number;
  nextArcs: Array<{ anilistId: number; title: string; year: number | null; episodes: number }>;
  next: StoryCandidateRow[];
  recent: StoryReviewRow[];
  loots: Array<{ loot: string; items: number }>;
};

const NEXT_LIMIT = 30;
/** Série com pelo menos tantos episódios é longa o bastante para a linha do tempo precisar de arcos. */
export const LONG_SERIES = 26;
const RECENT_LIMIT = 40;

function parseRelations(json: string | null): CandidateEntry["relations"] {
  if (!json) return [];
  try {
    return (JSON.parse(json) as Array<{ id?: unknown; relationType?: unknown }>).filter((r): r is { id: number; relationType: string } => typeof r.id === "number" && typeof r.relationType === "string");
  } catch {
    return [];
  }
}

export async function getStoryStatus(): Promise<StoryStatus> {
  const [rows, reviews, links, arcGroups, longRows] = await Promise.all([
    prisma.catalogEntry.findMany({
      where: { onPlatform: true, anilistId: { not: null }, kind: "EPISODE", relationsJson: { contains: "ALTERNATIVE" } },
      select: { anilistId: true, titleRomaji: true, kind: true, seasonYear: true, episodes: true, popularityRank: true, relationsJson: true },
    }),
    prisma.storyReview.findMany({ orderBy: { reviewedAt: "desc" } }),
    prisma.storyLink.findMany({ select: { oldAnilistId: true, newAnilistId: true, coverage: true, beyondFromEpisode: true } }),
    prisma.storyArc.groupBy({ by: ["anilistId"], _count: { _all: true } }),
    prisma.catalogEntry.findMany({ where: { onPlatform: true, anilistId: { not: null }, kind: "EPISODE", episodes: { gte: LONG_SERIES } }, select: { anilistId: true, titleRomaji: true, seasonYear: true, episodes: true }, orderBy: { episodes: "desc" } }),
  ]);
  const withArcs = new Set(arcGroups.map((g) => g.anilistId));
  const longPending = longRows.filter((r) => !withArcs.has(r.anilistId as number));
  const entries: CandidateEntry[] = rows.map((r) => ({ anilistId: r.anilistId as number, titleRomaji: r.titleRomaji, kind: r.kind, seasonYear: r.seasonYear, episodes: r.episodes, popularityRank: r.popularityRank, relations: parseRelations(r.relationsJson) }));
  const all = findRebootCandidates(entries, new Set());
  const reviewedKeys = new Set(reviews.map((r) => linkKey(r.anilistIdA, r.anilistIdB)));
  const pending = all.filter((c) => !reviewedKeys.has(c.key));

  const toRow = (e: CandidateEntry) => ({ anilistId: e.anilistId, title: e.titleRomaji, year: e.seasonYear, episodes: e.episodes });
  const recent = reviews.slice(0, RECENT_LIMIT);
  const titles = new Map(
    (await prisma.catalogEntry.findMany({ where: { anilistId: { in: recent.flatMap((r) => [r.anilistIdA, r.anilistIdB]) } }, select: { anilistId: true, titleRomaji: true } })).map((t) => [t.anilistId as number, t.titleRomaji])
  );
  const linkOf = (a: number, b: number) => links.find((l) => linkKey(l.oldAnilistId, l.newAnilistId) === linkKey(a, b));
  const lootCounts = new Map<string, number>();
  for (const r of reviews) if (r.loot) lootCounts.set(r.loot, (lootCounts.get(r.loot) ?? 0) + 1);

  return {
    candidates: all.length,
    reviewed: all.length - pending.length,
    reboots: reviews.filter((r) => r.verdict === "REBOOT").length,
    notReboots: reviews.filter((r) => r.verdict === "NOT_REBOOT").length,
    worksWithArcs: arcGroups.length,
    arcs: arcGroups.reduce((sum, g) => sum + g._count._all, 0),
    longWithoutArcs: longPending.length,
    nextArcs: longPending.slice(0, 10).map((r) => ({ anilistId: r.anilistId as number, title: r.titleRomaji, year: r.seasonYear, episodes: r.episodes as number })),
    next: pending.slice(0, NEXT_LIMIT).map((c) => ({ key: c.key, a: toRow(c.a), b: toRow(c.b) })),
    recent: recent.map((r) => {
      const link = linkOf(r.anilistIdA, r.anilistIdB);
      return { anilistIdA: r.anilistIdA, anilistIdB: r.anilistIdB, titleA: titles.get(r.anilistIdA) ?? `AniList ${r.anilistIdA}`, titleB: titles.get(r.anilistIdB) ?? `AniList ${r.anilistIdB}`, verdict: r.verdict, coverage: link?.coverage ?? null, beyondFromEpisode: link?.beyondFromEpisode ?? null, loot: r.loot, reviewedAt: r.reviewedAt.toISOString() };
    }),
    loots: [...lootCounts.entries()].map(([loot, items]) => ({ loot, items })).sort((a, b) => a.loot.localeCompare(b.loot)),
  };
}
