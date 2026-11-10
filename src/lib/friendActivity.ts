import { prisma } from "@/lib/prisma";
import { blockedUserIdSet } from "@/lib/blocks";
import { workHref } from "@/lib/workHref";
import type { ActivityItem } from "@/lib/friendActivityText";

/**
 * Atividade dos amigos (10/11/2026): "Fulano terminou X e deu 9". Só de quem LIGOU "Compartilhar minha atividade com
 * os amigos" em Configurações (vem desligado). Registra só duas coisas — terminar uma obra e dar nota — e uma linha por
 * pessoa, obra e tipo (dar outra nota atualiza a mesma). Aparece na lateral do Feed, agrupada por obra.
 */
export type ActivityKind = "FINISHED" | "RATED";

/** Nunca lança: registrar a atividade não pode derrubar a ação de marcar a lista. */
export async function recordFriendActivity(userId: string, animeId: string, kind: ActivityKind, score: number | null = null): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { shareActivity: true } });
    if (!user?.shareActivity) return;
    const anime = await prisma.anime.findUnique({ where: { id: animeId }, select: { anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true, titleEnglish: true, coverImage: true } });
    if (!anime) return;
    const href = workHref(anime);
    const workKey = anime.anilistId !== null ? String(anime.anilistId) : href ?? animeId;
    const data = { href, titleRomaji: anime.titleRomaji, titleEnglish: anime.titleEnglish, coverImage: anime.coverImage, score, createdAt: new Date() };
    await prisma.friendActivity.upsert({ where: { userId_workKey_kind: { userId, workKey, kind } }, create: { userId, workKey, kind, ...data }, update: data });
  } catch (error) {
    console.error("[friendActivity] falhou:", error);
  }
}

/** Tirar a nota ou sair de "Terminei" apaga o que tinha sido compartilhado (os amigos não veem algo que deixou de valer). */
export async function retractFriendActivity(userId: string, animeId: string, kind: ActivityKind): Promise<void> {
  try {
    const anime = await prisma.anime.findUnique({ where: { id: animeId }, select: { anilistId: true, anidbId: true, kitsuId: true } });
    if (!anime) return;
    const workKey = anime.anilistId !== null ? String(anime.anilistId) : workHref(anime) ?? animeId;
    await prisma.friendActivity.deleteMany({ where: { userId, workKey, kind } });
  } catch (error) {
    console.error("[friendActivity] falhou ao desfazer:", error);
  }
}

export { activityText, type ActivityItem } from "@/lib/friendActivityText";

type ActivityRow = { userId: string; workKey: string; kind: string; href: string | null; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; score: number | null; createdAt: Date; user: { id: string; displayName: string; avatarUrl: string | null } };

/** Junta "terminou" e "deu nota" da mesma pessoa na mesma obra numa linha só; a mais recente primeiro. */
export function groupActivity(rows: ActivityRow[], limit: number): ActivityItem[] {
  const byKey = new Map<string, ActivityItem>();
  for (const r of rows) {
    const key = `${r.userId}:${r.workKey}`;
    const item = byKey.get(key) ?? { key, user: r.user, workKey: r.workKey, href: r.href, titleRomaji: r.titleRomaji, titleEnglish: r.titleEnglish, coverImage: r.coverImage, finished: false, score: null, at: r.createdAt.toISOString() };
    if (r.kind === "FINISHED") item.finished = true;
    if (r.kind === "RATED") item.score = r.score;
    if (r.createdAt.toISOString() > item.at) item.at = r.createdAt.toISOString();
    byKey.set(key, item);
  }
  return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** O que os amigos (que compartilham) fizeram nos últimos 14 dias. */
export async function friendActivityFor(userId: string, limit = 8): Promise<ActivityItem[]> {
  const [links, blocked] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] }, select: { userAId: true, userBId: true } }),
    blockedUserIdSet(userId),
  ]);
  const friendIds = links.map((l) => (l.userAId === userId ? l.userBId : l.userAId)).filter((id) => !blocked.has(id));
  if (friendIds.length === 0) return [];
  const rows = await prisma.friendActivity.findMany({
    where: { userId: { in: friendIds }, user: { shareActivity: true }, createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  });
  return groupActivity(rows, limit);
}
