import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { blockRelation } from "@/lib/blocks";

type Params = { params: Promise<{ id: string }> };

/**
 * Perfil público mínimo — leitura não exige sessão (mesmo patamar de
 * abertura do Descobrir/Calendário). isFollowedByMe só fica true com uma
 * sessão ativa; anônimo sempre recebe false, não 401.
 */
export async function GET(request: Request, { params }: Params) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, handle: true, avatarUrl: true, bio: true, createdAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const viewer = await getCurrentUser();
  if ((await blockRelation(viewer?.id ?? null, id)) !== "none") {
    return NextResponse.json({ error: "Perfil indisponível" }, { status: 404 });
  }
  const [followerCount, followingCount, postCount, isFollowedByMe] = await Promise.all([
    prisma.follow.count({ where: { followingId: id } }),
    prisma.follow.count({ where: { followerId: id } }),
    prisma.post.count({ where: { userId: id, deletedAt: null } }),
    viewer
      ? prisma.follow
          .findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: id } } })
          .then((f) => f !== null)
      : Promise.resolve(false),
  ]);

  return NextResponse.json({
    user: {
      id: target.id,
      displayName: target.displayName,
      handle: target.handle,
      avatarUrl: target.avatarUrl,
      bio: target.bio,
      createdAt: target.createdAt.toISOString(),
      followerCount,
      followingCount,
      postCount,
      isFollowedByMe,
    },
  });
}
