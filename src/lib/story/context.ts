import { prisma } from "@/lib/prisma";
import { excludedEdges, linkKey, type ArcInfo } from "./versions";

/**
 * O que a página de uma obra precisa saber sobre reboot e arcos (Epic 48): a outra versão da história (com o aviso do que ela
 * cobre), os arcos dos episódios e quais obras são da outra versão (para não entrarem nas temporadas desta).
 */
export type StoryOther = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  seasonYear: number | null;
  episodes: number | null;
};

export type StoryRelation = {
  /** O que a obra aberta é nesse vínculo: o reboot (versão nova) ou o original (versão antiga). */
  role: "REBOOT" | "ORIGINAL";
  other: StoryOther;
  coverage: "FULL" | "PARTIAL";
  /** Episódio do reboot a partir do qual a história passa do que a versão antiga cobriu (só PARTIAL). */
  beyondFromEpisode: number | null;
  /** Arco do reboot em que isso começa, se conhecido. */
  beyondArc: Pick<ArcInfo, "nameEn" | "namePt" | "nameJa"> | null;
  note: string | null;
  source: string | null;
};

export type StoryContext = { relations: StoryRelation[]; arcs: ArcInfo[]; otherVersionIds: number[] };

export const EMPTY_STORY: StoryContext = { relations: [], arcs: [], otherVersionIds: [] };

const MAX_REACH = 200;

function parseIds(json: string | null): number[] {
  if (!json) return [];
  try {
    return (JSON.parse(json) as Array<{ id?: unknown }>).map((r) => r.id).filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

/** Obras alcançáveis a partir de `start` pelas relações do catálogo, sem atravessar os pares de reboot (`excluded`). */
async function reach(start: number, excluded: ReadonlySet<string>): Promise<Set<number>> {
  const seen = new Set<number>([start]);
  let frontier = [start];
  for (let round = 0; round < 8 && frontier.length && seen.size < MAX_REACH; round += 1) {
    const rows = await prisma.catalogEntry.findMany({ where: { anilistId: { in: frontier }, onPlatform: true }, select: { anilistId: true, relationsJson: true } });
    const next: number[] = [];
    for (const row of rows) {
      for (const id of parseIds(row.relationsJson)) {
        if (seen.has(id) || excluded.has(linkKey(row.anilistId as number, id))) continue;
        seen.add(id);
        next.push(id);
      }
    }
    frontier = next;
  }
  return seen;
}

export async function loadStoryContext(anilistId: number): Promise<StoryContext> {
  const [links, arcs] = await Promise.all([
    prisma.storyLink.findMany({ where: { OR: [{ oldAnilistId: anilistId }, { newAnilistId: anilistId }] } }),
    prisma.storyArc.findMany({ where: { anilistId }, orderBy: { position: "asc" } }),
  ]);
  const arcInfo = (a: (typeof arcs)[number]): ArcInfo => ({ position: a.position, nameEn: a.nameEn, namePt: a.namePt, nameJa: a.nameJa, startEpisode: a.startEpisode, endEpisode: a.endEpisode });
  if (links.length === 0) return { relations: [], arcs: arcs.map(arcInfo), otherVersionIds: [] };

  const otherIds = links.map((l) => (l.oldAnilistId === anilistId ? l.newAnilistId : l.oldAnilistId));
  const [others, newArcs] = await Promise.all([
    prisma.catalogEntry.findMany({ where: { anilistId: { in: otherIds } }, select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true, seasonYear: true, episodes: true } }),
    prisma.storyArc.findMany({ where: { anilistId: { in: links.map((l) => l.newAnilistId) } }, orderBy: { position: "asc" } }),
  ]);
  const byId = new Map(others.map((o) => [o.anilistId as number, o]));

  const relations: StoryRelation[] = [];
  for (const link of links) {
    const role = link.newAnilistId === anilistId ? "REBOOT" : "ORIGINAL";
    const otherId = role === "REBOOT" ? link.oldAnilistId : link.newAnilistId;
    const other = byId.get(otherId);
    if (!other) continue; // a outra versão saiu da plataforma: não há o que apontar
    const beyondArc = link.beyondFromEpisode === null ? null : (newArcs.find((a) => a.anilistId === link.newAnilistId && link.beyondFromEpisode! >= a.startEpisode && link.beyondFromEpisode! <= a.endEpisode) ?? null);
    relations.push({
      role,
      other: { anilistId: otherId, titleRomaji: other.titleRomaji, titleEnglish: other.titleEnglish, titleNative: other.titleNative, coverImage: other.coverImage, seasonYear: other.seasonYear, episodes: other.episodes },
      coverage: link.coverage === "PARTIAL" ? "PARTIAL" : "FULL",
      beyondFromEpisode: link.coverage === "PARTIAL" ? link.beyondFromEpisode : null,
      beyondArc: beyondArc ? { nameEn: beyondArc.nameEn, namePt: beyondArc.namePt, nameJa: beyondArc.nameJa } : null,
      note: link.note,
      source: link.source,
    });
  }

  // As obras da outra versão (a antiga/nova com as suas temporadas, OVA e filmes) não entram nas temporadas desta.
  const excluded = excludedEdges(links);
  const own = await reach(anilistId, excluded);
  const theirs = new Set<number>();
  for (const id of otherIds) for (const reached of await reach(id, excluded)) if (!own.has(reached)) theirs.add(reached);
  return { relations, arcs: arcs.map(arcInfo), otherVersionIds: [...theirs] };
}
