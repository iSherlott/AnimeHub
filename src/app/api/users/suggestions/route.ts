import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { blockedUserIdSet } from "@/lib/blocks";
import { friendSuggestions } from "@/lib/friends";
import { NEWSHUB_EMAIL } from "@/lib/newsHub";

const SUGGESTION_COUNT = 5;

/**
 * Sugestões de quem seguir pra popular a aba "Seguindo" quando ainda está
 * vazia — sem página de diretório separada. Primeiro quem tem comunidades ou
 * animes em comum (as mesmas sugestões da página Amigos); o resto, membros
 * mais novos. Sem quem já é seguido, bloqueios e a conta do sistema.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [followed, blocked, common] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: user.id }, select: { followingId: true } }),
    blockedUserIdSet(user.id),
    friendSuggestions(user.id, 20),
  ]);
  const followedIds = new Set(followed.map((f) => f.followingId));
  const ranked = common.filter((p) => !followedIds.has(p.id)).slice(0, SUGGESTION_COUNT).map((p) => ({ id: p.id, displayName: p.displayName }));

  const excludeIds = [user.id, ...followedIds, ...blocked, ...ranked.map((u) => u.id)];
  const newest =
    ranked.length < SUGGESTION_COUNT
      ? await prisma.user.findMany({
          where: { id: { notIn: excludeIds }, email: { not: NEWSHUB_EMAIL } },
          select: { id: true, displayName: true },
          orderBy: { createdAt: "desc" },
          take: SUGGESTION_COUNT - ranked.length,
        })
      : [];

  return NextResponse.json({ users: [...ranked, ...newest] });
}
