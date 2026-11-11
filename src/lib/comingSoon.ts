import { prisma } from "@/lib/prisma";
import { currentSeasonRef } from "@/lib/exploreGroups";
import { deriveCategory } from "@/lib/watchCategory";
import type { SeasonRef } from "@/lib/exploreGroups";

/**
 * "Em breve" (12/11/2026): as continuações, filmes e especiais anunciados — ou que acabaram de estrear — das obras que a
 * pessoa já assistiu (algum episódio: assistindo, não terminei, terminei) ou marcou como favorita. Dropada nunca entra.
 * A tela abre só pelo sino (Lançamentos → Em breve); o aviso do sino (WORK_ANNOUNCED) usa esta mesma regra.
 *
 * A ligação vem das relações da AniList guardadas na obra nova: PREQUEL (é continuação de…) ou PARENT (é filme ou especial
 * de…). Só obras ainda por estrear ou que estrearam há pouco: a carga de obras antigas não vira novidade.
 */
const RELATIONS = new Set(["PREQUEL", "PARENT"]);
export const RECENT_START_DAYS = 60;

export type AnnouncedRelation = { id: number; type: "PREQUEL" | "PARENT" };

/** As obras de quem a nova é continuação (PREQUEL) ou filme/especial (PARENT), pelas relações da AniList. */
export function announcedRelations(relationsJson: string | null): AnnouncedRelation[] {
  if (!relationsJson) return [];
  try {
    const parsed = JSON.parse(relationsJson) as Array<{ id?: unknown; relationType?: unknown }>;
    return Array.isArray(parsed)
      ? parsed
          .filter((r) => typeof r?.relationType === "string" && RELATIONS.has(r.relationType) && Number.isInteger(r.id))
          .map((r) => ({ id: r.id as number, type: r.relationType as AnnouncedRelation["type"] }))
      : [];
  } catch {
    return [];
  }
}

export type FollowedRow = {
  watchState: string | null;
  isFavorite: boolean;
  waiting: boolean;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
};

/** A obra da lista conta para o "Em breve": já assistida (algum episódio) ou favorita, e nunca dropada. */
export function countsForComingSoon(row: FollowedRow, hasPending: boolean, current: SeasonRef): boolean {
  if (row.watchState === "DROPPED") return false;
  if (row.isFavorite) return true;
  const category = deriveCategory({ watchState: row.watchState, hasPending, waiting: row.waiting, status: row.status, season: row.season, seasonYear: row.seasonYear }, current);
  return category === "watching" || category === "unfinished" || category === "finished";
}

export type ComingSoonItem = {
  key: string;
  title: string;
  coverImage: string | null;
  format: string | null;
  status: "RELEASING" | "NOT_YET_RELEASED";
  startDate: string | null;
  season: string | null;
  seasonYear: number | null;
  relation: AnnouncedRelation["type"];
  relatedKey: string;
  relatedTitle: string;
  /** A obra nova já está na lista da pessoa. */
  inList: boolean;
};

type Candidate = { anilistId: number | null; titleRomaji: string; coverImage: string | null; format: string | null; status: string | null; startDate: Date | null; season: string | null; seasonYear: number | null; relationsJson: string | null };

/** Monta a lista a partir das obras da pessoa e dos candidatos do catálogo (sem banco; ver comingSoonFor). */
export function comingSoonItems(followed: Map<number, string>, inList: Set<number>, candidates: Candidate[]): ComingSoonItem[] {
  const items: ComingSoonItem[] = [];
  for (const c of candidates) {
    if (c.anilistId === null || (c.status !== "RELEASING" && c.status !== "NOT_YET_RELEASED")) continue;
    const hit = announcedRelations(c.relationsJson).find((r) => followed.has(r.id));
    if (!hit) continue;
    items.push({
      key: String(c.anilistId),
      title: c.titleRomaji,
      coverImage: c.coverImage,
      format: c.format,
      status: c.status,
      startDate: c.startDate ? c.startDate.toISOString() : null,
      season: c.season,
      seasonYear: c.seasonYear,
      relation: hit.type,
      relatedKey: String(hit.id),
      relatedTitle: followed.get(hit.id) as string,
      inList: inList.has(c.anilistId),
    });
  }
  // Já no ar primeiro (a estreia mais recente no topo); depois o anunciado, da estreia mais próxima à sem data.
  const time = (i: ComingSoonItem) => (i.startDate ? Date.parse(i.startDate) : Number.POSITIVE_INFINITY);
  return items.sort((a, b) => {
    if (a.status !== b.status) return a.status === "RELEASING" ? -1 : 1;
    if (a.status === "RELEASING") return time(b) - time(a);
    return time(a) - time(b) || a.title.localeCompare(b.title, "pt-BR");
  });
}

export async function comingSoonFor(userId: string, now: Date = new Date()): Promise<ComingSoonItem[]> {
  const [list, pending] = await Promise.all([
    prisma.anime.findMany({
      where: { userId, anilistId: { not: null } },
      select: { anilistId: true, titleRomaji: true, watchState: true, isFavorite: true, waiting: true, status: true, season: true, seasonYear: true },
    }),
    prisma.pendingEpisode.findMany({ where: { userId }, select: { anilistId: true } }),
  ]);
  const current = currentSeasonRef(now);
  const pendingIds = new Set(pending.map((p) => p.anilistId));
  const followed = new Map<number, string>();
  for (const row of list) {
    const id = row.anilistId as number;
    if (countsForComingSoon(row, pendingIds.has(id), current)) followed.set(id, row.titleRomaji);
  }
  if (followed.size === 0) return [];
  const since = new Date(now.getTime() - RECENT_START_DAYS * 86400_000);
  const candidates = await prisma.catalogEntry.findMany({
    where: {
      onPlatform: true,
      anilistId: { not: null },
      relationsJson: { not: null },
      status: { in: ["NOT_YET_RELEASED", "RELEASING"] },
      OR: [{ startDate: null }, { startDate: { gte: since } }],
    },
    select: { anilistId: true, titleRomaji: true, coverImage: true, format: true, status: true, startDate: true, season: true, seasonYear: true, relationsJson: true },
  });
  return comingSoonItems(followed, new Set(list.map((r) => r.anilistId as number)), candidates);
}
