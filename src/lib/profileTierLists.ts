import { prisma } from "@/lib/prisma";
import { seasonDisplayName, seasonSlug, type SeasonName } from "@/lib/exploreGroups";
import { parseTierSnapshot, TIERS, type TierSnapshot } from "@/lib/tierListTypes";

/**
 * As tier lists no perfil (12/11/2026), como os álbuns: uma por temporada que a pessoa publicou no Feed. Mostra o quadro
 * guardado na publicação (o que a rede viu), não o rascunho que ela continua mexendo. Publicação apagada sai daqui também.
 */
export type ProfileTierList = { slug: string; label: string; seasonYear: number; season: string; count: number; covers: string[]; postId: string; snapshot: TierSnapshot };

const SEASON_ORDER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };

export async function profileTierLists(userId: string): Promise<ProfileTierList[]> {
  const lists = await prisma.tierList.findMany({ where: { userId, postId: { not: null } }, select: { season: true, seasonYear: true, postId: true } });
  if (lists.length === 0) return [];
  const posts = new Map(
    (await prisma.post.findMany({ where: { id: { in: lists.map((l) => l.postId as string) }, deletedAt: null }, select: { id: true, tierListJson: true } })).map((p) => [p.id, p.tierListJson])
  );
  const out: ProfileTierList[] = [];
  for (const l of lists) {
    const snapshot = parseTierSnapshot(posts.get(l.postId as string) ?? null);
    if (!snapshot) continue;
    const ref = { season: l.season as SeasonName, year: l.seasonYear };
    const ordered = TIERS.flatMap((t) => snapshot.tiers[t]);
    out.push({
      slug: seasonSlug(ref),
      label: seasonDisplayName(ref),
      season: l.season,
      seasonYear: l.seasonYear,
      count: ordered.length,
      // A capa do cartão: as primeiras obras do S para baixo.
      covers: ordered.map((w) => w.cover).filter((c): c is string => Boolean(c)).slice(0, 4),
      postId: l.postId as string,
      snapshot,
    });
  }
  return out.sort((a, b) => b.seasonYear - a.seasonYear || (SEASON_ORDER[b.season] ?? 0) - (SEASON_ORDER[a.season] ?? 0));
}
