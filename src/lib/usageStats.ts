import { prisma } from "@/lib/prisma";
import { NEWSHUB_EMAIL } from "@/lib/newsHub";

/**
 * Painel de uso (Admin → Uso da rede, 12/11/2026): o que a rede de fato usa, para decidir o que manter ou melhorar.
 * Só números somados — nunca quem fez o quê. "Pessoa ativa" = quem publicou, comentou, curtiu, reagiu a um episódio,
 * mexeu na lista, votou (anime da semana, bolão, enquete) ou marcou "vou" num evento no período. O NewsHub não conta.
 */
export type UsageWindow = { days: number; activePeople: number; newAccounts: number; posts: number; comments: number; likes: number; listChanges: number; episodeReactions: number };
export type UsageStats = {
  accounts: number;
  windows: UsageWindow[];
  /** Os últimos 14 dias, do mais antigo ao de hoje: publicações + comentários + curtidas por dia. */
  daily: { day: string; posts: number; comments: number; likes: number }[];
  features: { label: string; value: number; hint: string }[];
};

const DAY = 86400_000;

function dayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function activePeople(since: Date, hubId: string | null): Promise<number> {
  const notHub = hubId ? { not: hubId } : undefined;
  const ids = await Promise.all([
    prisma.post.findMany({ where: { createdAt: { gte: since }, userId: notHub }, select: { userId: true }, distinct: ["userId"] }),
    prisma.postComment.findMany({ where: { createdAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.postLike.findMany({ where: { createdAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.episodeReaction.findMany({ where: { updatedAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.anime.findMany({ where: { updatedAt: { gte: since }, userId: { not: null } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.weeklyVoteBallot.findMany({ where: { createdAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.seasonPoolPick.findMany({ where: { createdAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.postPollVote.findMany({ where: { votedAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.animeEventRsvp.findMany({ where: { createdAt: { gte: since } }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  return new Set(ids.flat().map((r) => r.userId).filter((id): id is string => Boolean(id))).size;
}

export async function usageStats(now = new Date(), timeZone = "America/Sao_Paulo"): Promise<UsageStats> {
  const hub = await prisma.user.findUnique({ where: { email: NEWSHUB_EMAIL }, select: { id: true } });
  const hubId = hub?.id ?? null;
  const people = { userId: hubId ? { not: hubId } : undefined };
  const accounts = await prisma.user.count({ where: hubId ? { id: { not: hubId } } : {} });

  const windows: UsageWindow[] = [];
  for (const days of [7, 30]) {
    const since = new Date(now.getTime() - days * DAY);
    const [active, newAccounts, posts, comments, likes, listChanges, episodeReactions] = await Promise.all([
      activePeople(since, hubId),
      prisma.user.count({ where: { createdAt: { gte: since }, ...(hubId ? { id: { not: hubId } } : {}) } }),
      prisma.post.count({ where: { createdAt: { gte: since }, deletedAt: null, ...people } }),
      prisma.postComment.count({ where: { createdAt: { gte: since }, deletedAt: null } }),
      prisma.postLike.count({ where: { createdAt: { gte: since } } }),
      prisma.anime.count({ where: { updatedAt: { gte: since } } }),
      prisma.episodeReaction.count({ where: { updatedAt: { gte: since } } }),
    ]);
    windows.push({ days, activePeople: active, newAccounts, posts, comments, likes, listChanges, episodeReactions });
  }

  const since14 = new Date(now.getTime() - 13 * DAY);
  since14.setUTCHours(0, 0, 0, 0);
  const [posts14, comments14, likes14] = await Promise.all([
    prisma.post.findMany({ where: { createdAt: { gte: since14 }, deletedAt: null, ...people }, select: { createdAt: true } }),
    prisma.postComment.findMany({ where: { createdAt: { gte: since14 }, deletedAt: null }, select: { createdAt: true } }),
    prisma.postLike.findMany({ where: { createdAt: { gte: since14 } }, select: { createdAt: true } }),
  ]);
  const daily = new Map<string, { day: string; posts: number; comments: number; likes: number }>();
  for (let i = 13; i >= 0; i -= 1) {
    const key = dayKey(new Date(now.getTime() - i * DAY), timeZone);
    daily.set(key, { day: key, posts: 0, comments: 0, likes: 0 });
  }
  for (const p of posts14) if (daily.has(dayKey(p.createdAt, timeZone))) daily.get(dayKey(p.createdAt, timeZone))!.posts += 1;
  for (const c of comments14) if (daily.has(dayKey(c.createdAt, timeZone))) daily.get(dayKey(c.createdAt, timeZone))!.comments += 1;
  for (const l of likes14) if (daily.has(dayKey(l.createdAt, timeZone))) daily.get(dayKey(l.createdAt, timeZone))!.likes += 1;

  const since30 = new Date(now.getTime() - 30 * DAY);
  const [news, tierLists, ballots, poolPicks, pollVotes, rsvps, recs, recLinks, recLinkViews, mentions, mutes] = await Promise.all([
    hubId ? prisma.post.count({ where: { userId: hubId, createdAt: { gte: since30 }, deletedAt: null } }) : 0,
    prisma.tierList.count({ where: { postId: { not: null }, updatedAt: { gte: since30 } } }),
    prisma.weeklyVoteBallot.count({ where: { createdAt: { gte: since30 } } }),
    prisma.seasonPoolPick.count({ where: { createdAt: { gte: since30 } } }),
    prisma.postPollVote.count({ where: { votedAt: { gte: since30 } } }),
    prisma.animeEventRsvp.count({ where: { createdAt: { gte: since30 } } }),
    prisma.workRecommendation.count({ where: { createdAt: { gte: since30 } } }),
    prisma.recommendationLink.count({ where: { createdAt: { gte: since30 } } }),
    prisma.recommendationLink.aggregate({ _sum: { views: true } }),
    prisma.socialNotification.count({ where: { type: "MENTION", createdAt: { gte: since30 } } }),
    prisma.mutedTopic.count(),
  ]);
  const features = [
    { label: "Notícias do NewsHub", value: news, hint: "publicadas nos últimos 30 dias" },
    { label: "Tier lists publicadas", value: tierLists, hint: "nos últimos 30 dias" },
    { label: "Votos no anime da semana", value: ballots, hint: "nos últimos 30 dias" },
    { label: "Escolhas no bolão", value: poolPicks, hint: "nos últimos 30 dias" },
    { label: "Votos em enquetes do Feed", value: pollVotes, hint: "nos últimos 30 dias" },
    { label: "“Vou” em eventos", value: rsvps, hint: "nos últimos 30 dias" },
    { label: "Recomendações entre amigos", value: recs, hint: "nos últimos 30 dias" },
    { label: "Links de recomendação", value: recLinks, hint: `criados em 30 dias · ${recLinkViews._sum.views ?? 0} visitas no total` },
    { label: "Menções com @", value: mentions, hint: "avisos nos últimos 30 dias" },
    { label: "Itens silenciados", value: mutes, hint: "obras e # silenciadas, no total" },
  ];
  return { accounts, windows, daily: [...daily.values()], features };
}
