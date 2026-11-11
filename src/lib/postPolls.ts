import { prisma } from "@/lib/prisma";
import type { PollInput, PostPollDTO } from "@/lib/postPollTypes";

/**
 * Enquete numa publicação do Feed (12/11/2026), como a das comunidades: um voto por pessoa, que pode ser trocado
 * enquanto a enquete está aberta. O resultado aparece depois de votar (ou quando fecha); o autor vê sempre.
 */
export async function createPostPoll(postId: string, input: PollInput, now = new Date()): Promise<void> {
  await prisma.postPoll.create({
    data: {
      postId,
      closesAt: input.days ? new Date(now.getTime() + input.days * 86400_000) : null,
      options: { create: input.options.map((label, position) => ({ label, position })) },
    },
  });
}

export async function pollsFor(postIds: string[], viewerId: string | null, now = new Date()): Promise<Map<string, PostPollDTO>> {
  if (postIds.length === 0) return new Map();
  const polls = await prisma.postPoll.findMany({
    where: { postId: { in: postIds } },
    include: { options: { orderBy: { position: "asc" }, include: { _count: { select: { votes: true } } } } },
  });
  if (polls.length === 0) return new Map();
  const mine = viewerId
    ? new Map((await prisma.postPollVote.findMany({ where: { userId: viewerId, pollId: { in: polls.map((p) => p.id) } }, select: { pollId: true, optionId: true } })).map((v) => [v.pollId, v.optionId]))
    : new Map<string, string>();
  return new Map(
    polls.map((p) => {
      const options = p.options.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes }));
      return [
        p.postId,
        { options, total: options.reduce((s, o) => s + o.votes, 0), myOptionId: mine.get(p.id) ?? null, closesAt: p.closesAt?.toISOString() ?? null, closed: Boolean(p.closesAt && p.closesAt <= now) },
      ];
    })
  );
}

export type VoteResult = { ok: true; poll: PostPollDTO } | { ok: false; status: 404 | 409; error: string };

export async function votePostPoll(postId: string, userId: string, optionId: string, now = new Date()): Promise<VoteResult> {
  const poll = await prisma.postPoll.findUnique({ where: { postId }, include: { options: { select: { id: true } }, post: { select: { deletedAt: true } } } });
  if (!poll || poll.post.deletedAt || !poll.options.some((o) => o.id === optionId)) return { ok: false, status: 404, error: "Enquete não encontrada." };
  if (poll.closesAt && poll.closesAt <= now) return { ok: false, status: 409, error: "A enquete já fechou." };
  await prisma.postPollVote.upsert({ where: { pollId_userId: { pollId: poll.id, userId } }, create: { pollId: poll.id, userId, optionId }, update: { optionId, votedAt: now } });
  const summary = (await pollsFor([postId], userId, now)).get(postId);
  return summary ? { ok: true, poll: summary } : { ok: false, status: 404, error: "Enquete não encontrada." };
}
