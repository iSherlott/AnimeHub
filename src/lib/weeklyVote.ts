import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { ensureNewsHub, animeHashtagFor, linkTagToAnime } from "@/lib/newsHub";
import { extractHashtags, MAX_HASHTAGS_PER_POST } from "@/lib/hashtags";
import { linkHashtagsToPost } from "@/lib/postHashtags";

/**
 * Anime da semana (10/11/2026): o admin abre a votação (os disparos ficam no painel), com as obras da plataforma que
 * tiveram episódio nos últimos 7 dias. Cada pessoa vota uma vez (pode trocar o voto enquanto está aberta). Ao encerrar,
 * o NewsHub publica o resultado no Feed com a # da obra vencedora.
 */
export const MAX_OPTIONS = 20;
const WEEK_MS = 7 * 24 * 3600 * 1000;

import type { WeeklyOption, WeeklyVoteView } from "@/lib/weeklyVoteTypes";
export type { WeeklyOption, WeeklyVoteView };

/** As obras com episódio exibido na janela, uma vez cada (a mais popular primeiro), com o último episódio exibido. */
export async function weeklyCandidates(now = new Date()): Promise<{ workKey: string; anilistId: number; titleRomaji: string; coverImage: string | null; episode: number }[]> {
  const rows = await prisma.airingScheduleEntry.findMany({
    where: { status: "ACTIVE", anilistId: { not: null }, airingAt: { gte: new Date(now.getTime() - WEEK_MS), lte: now } },
    select: { anilistId: true, episode: true },
  });
  const lastEpisode = new Map<number, number>();
  for (const r of rows) lastEpisode.set(r.anilistId as number, Math.max(lastEpisode.get(r.anilistId as number) ?? 0, r.episode));
  if (lastEpisode.size === 0) return [];
  const works = await prisma.catalogEntry.findMany({
    where: { anilistId: { in: [...lastEpisode.keys()] }, onPlatform: true, ...NOT_BLOCKED_GENRE },
    select: { anilistId: true, titleRomaji: true, coverImage: true, popularityRank: true },
    orderBy: [{ popularityRank: { sort: "asc", nulls: "last" } }, { titleRomaji: "asc" }],
    take: MAX_OPTIONS,
  });
  return works.map((w) => ({ workKey: String(w.anilistId), anilistId: w.anilistId as number, titleRomaji: w.titleRomaji, coverImage: w.coverImage, episode: lastEpisode.get(w.anilistId as number) ?? 0 }));
}

export async function openWeeklyVote(admin: { id: string }, input: { days?: unknown; title?: unknown }, now = new Date()): Promise<{ ok: true; id: string } | { ok: false; status: 400 | 409; error: string }> {
  if (await prisma.weeklyVote.findFirst({ where: { status: "OPEN" }, select: { id: true } })) return { ok: false, status: 409, error: "Já existe uma votação aberta. Encerre-a antes de abrir outra." };
  const days = Number(input.days ?? 3);
  if (!Number.isInteger(days) || days < 1 || days > 7) return { ok: false, status: 400, error: "A votação fica aberta de 1 a 7 dias." };
  const candidates = await weeklyCandidates(now);
  if (candidates.length < 2) return { ok: false, status: 400, error: "Precisa de pelo menos 2 obras com episódio nesta semana." };
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 120) : "Anime da semana";
  const vote = await prisma.weeklyVote.create({
    data: {
      title,
      weekStart: new Date(now.getTime() - WEEK_MS),
      closesAt: new Date(now.getTime() + days * 24 * 3600 * 1000),
      createdById: admin.id,
      options: { create: candidates.map((c, position) => ({ workKey: c.workKey, titleRomaji: c.titleRomaji, coverImage: c.coverImage, episode: c.episode, position })) },
    },
  });
  return { ok: true, id: vote.id };
}

export async function castBallot(userId: string, voteId: string, optionId: string, now = new Date()): Promise<{ ok: true } | { ok: false; status: 400 | 404 | 409; error: string }> {
  const vote = await prisma.weeklyVote.findUnique({ where: { id: voteId }, select: { status: true, closesAt: true } });
  if (!vote) return { ok: false, status: 404, error: "Votação não encontrada." };
  if (vote.status !== "OPEN" || vote.closesAt <= now) return { ok: false, status: 409, error: "A votação já foi encerrada." };
  const option = await prisma.weeklyVoteOption.findFirst({ where: { id: optionId, voteId }, select: { id: true } });
  if (!option) return { ok: false, status: 400, error: "Opção inválida." };
  await prisma.weeklyVoteBallot.upsert({ where: { voteId_userId: { voteId, userId } }, create: { voteId, userId, optionId }, update: { optionId } });
  return { ok: true };
}

/** O vencedor: mais votos; empate fica com a obra que veio primeiro na lista (a mais popular). */
export function pickWinner(options: { workKey: string; position: number; votes: number }[]): string | null {
  const sorted = [...options].sort((a, b) => b.votes - a.votes || a.position - b.position);
  return sorted[0] && sorted[0].votes > 0 ? sorted[0].workKey : null;
}

export async function closeWeeklyVote(voteId: string, now = new Date()): Promise<{ ok: true; winnerKey: string | null; postId: string | null } | { ok: false; status: 404 | 409; error: string }> {
  const vote = await prisma.weeklyVote.findUnique({ where: { id: voteId }, include: { options: { include: { _count: { select: { ballots: true } } } } } });
  if (!vote) return { ok: false, status: 404, error: "Votação não encontrada." };
  if (vote.status !== "OPEN") return { ok: false, status: 409, error: "A votação já foi encerrada." };
  const tally = vote.options.map((o) => ({ workKey: o.workKey, position: o.position, votes: o._count.ballots, titleRomaji: o.titleRomaji, coverImage: o.coverImage }));
  const winnerKey = pickWinner(tally);
  let postId: string | null = null;
  const winner = tally.find((t) => t.workKey === winnerKey);
  if (winner) {
    const entry = await prisma.catalogEntry.findUnique({ where: { anilistId: Number(winner.workKey) }, select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true, bannerImage: true } });
    const total = tally.reduce((sum, t) => sum + t.votes, 0);
    const tag = entry ? animeHashtagFor(entry) : null;
    const ranking = [...tally].sort((a, b) => b.votes - a.votes || a.position - b.position).slice(0, 3).map((t, i) => `${i + 1}º ${t.titleRomaji} — ${t.votes} ${t.votes === 1 ? "voto" : "votos"}`);
    const body = [`🏆 ${vote.title}: ${winner.titleRomaji}!`, "", ...ranking, "", `${total} ${total === 1 ? "pessoa votou" : "pessoas votaram"}.${tag ? ` ${tag}` : ""}`].join("\n");
    const hub = await ensureNewsHub();
    const image = entry?.bannerImage ?? entry?.coverImage ?? winner.coverImage;
    const post = await prisma.post.create({
      data: { userId: hub.id, anilistId: entry?.anilistId ?? null, animeTitleRomaji: entry?.titleRomaji ?? winner.titleRomaji, animeTitleEnglish: entry?.titleEnglish ?? null, animeCoverImage: entry?.coverImage ?? winner.coverImage, body, imageUrls: image ? [image] : [], createdAt: now },
    });
    await linkHashtagsToPost(post.id, extractHashtags(body).slice(0, MAX_HASHTAGS_PER_POST), [entry?.titleRomaji ?? null, entry?.titleEnglish ?? null]);
    if (tag && entry?.anilistId) await linkTagToAnime(tag.slice(1), entry.anilistId);
    postId = post.id;
  }
  await prisma.weeklyVote.update({ where: { id: voteId }, data: { status: "CLOSED", winnerKey, postId } });
  return { ok: true, winnerKey, postId };
}

/** A votação aberta ou a última encerrada (até 7 dias depois), para o Feed. */
export async function currentWeeklyVote(viewerId: string | null, now = new Date()): Promise<WeeklyVoteView | null> {
  const vote =
    (await prisma.weeklyVote.findFirst({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" } })) ??
    (await prisma.weeklyVote.findFirst({ where: { status: "CLOSED", closesAt: { gte: new Date(now.getTime() - WEEK_MS) } }, orderBy: { createdAt: "desc" } }));
  if (!vote) return null;
  const [options, mine] = await Promise.all([
    prisma.weeklyVoteOption.findMany({ where: { voteId: vote.id }, orderBy: { position: "asc" }, include: { _count: { select: { ballots: true } } } }),
    viewerId ? prisma.weeklyVoteBallot.findUnique({ where: { voteId_userId: { voteId: vote.id, userId: viewerId } }, select: { optionId: true } }) : null,
  ]);
  return {
    id: vote.id,
    title: vote.title,
    status: vote.status === "OPEN" && vote.closesAt <= now ? "EXPIRED" : vote.status,
    closesAt: vote.closesAt.toISOString(),
    options: options.map((o) => ({ id: o.id, workKey: o.workKey, titleRomaji: o.titleRomaji, coverImage: o.coverImage, episode: o.episode, votes: o._count.ballots })),
    myOptionId: mine?.optionId ?? null,
    totalVotes: options.reduce((sum, o) => sum + o._count.ballots, 0),
    winnerKey: vote.winnerKey,
    postId: vote.postId,
  };
}
