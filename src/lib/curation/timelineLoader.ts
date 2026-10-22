import { prisma } from "@/lib/prisma";
import { excludedEdges, linkKey } from "@/lib/story/versions";
import { buildTimeline, type FranchiseTimeline, type TimelineNode, type TimelineRelation } from "./timeline";

const MAX_ROUNDS = 6;

function parseRelations(json: string | null): TimelineRelation[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as Array<{ id?: unknown; relationType?: unknown }>;
    return raw.filter((r): r is { id: number; relationType: string } => typeof r.id === "number" && typeof r.relationType === "string").map((r) => ({ id: r.id, relationType: r.relationType }));
  } catch {
    return [];
  }
}

/**
 * Linha do tempo de uma obra a partir do catálogo: segue as relações guardadas (`relationsJson`) por até 6 saltos, só entre
 * obras que estão na plataforma, e monta a linha principal, os especiais e as séries ligadas. `null` se a obra não está no
 * catálogo; obras sem relações voltam só com a linha principal de uma temporada.
 */
export async function loadTimeline(anilistId: number): Promise<FranchiseTimeline | null> {
  const nodes = new Map<number, TimelineNode>();
  const links: Array<{ oldAnilistId: number; newAnilistId: number }> = [];
  let excluded = new Set<string>();
  let frontier = [anilistId];
  for (let round = 0; round < MAX_ROUNDS && frontier.length; round += 1) {
    const rows = await prisma.catalogEntry.findMany({
      where: { anilistId: { in: frontier }, onPlatform: true },
      select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, kind: true, format: true, season: true, seasonYear: true, startDate: true, episodes: true, coverImage: true, relationsJson: true },
    });
    // Versões de uma mesma história (reboot): não se segue a relação entre elas.
    links.push(...(await prisma.storyLink.findMany({ where: { OR: [{ oldAnilistId: { in: frontier } }, { newAnilistId: { in: frontier } }] }, select: { oldAnilistId: true, newAnilistId: true } })));
    excluded = excludedEdges(links);
    const next = new Set<number>();
    for (const row of rows) {
      if (row.anilistId === null || nodes.has(row.anilistId)) continue;
      const relations = parseRelations(row.relationsJson);
      nodes.set(row.anilistId, {
        anilistId: row.anilistId,
        titleRomaji: row.titleRomaji,
        titleEnglish: row.titleEnglish,
        titleNative: row.titleNative,
        kind: row.kind,
        format: row.format,
        season: row.season,
        seasonYear: row.seasonYear,
        startDate: row.startDate ? row.startDate.toISOString() : null,
        episodes: row.episodes,
        coverImage: row.coverImage,
        relations,
      });
      for (const rel of relations) if (!nodes.has(rel.id) && !excluded.has(linkKey(row.anilistId, rel.id))) next.add(rel.id);
    }
    frontier = [...next];
  }
  return buildTimeline(anilistId, nodes, excluded);
}
