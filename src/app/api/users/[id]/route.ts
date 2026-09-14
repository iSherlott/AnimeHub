import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

/**
 * Perfil público mínimo — leitura não exige sessão (mesmo patamar de
 * abertura do Descobrir/Calendário). isFollowedByMe só fica true com uma
 * sessão ativa; anônimo sempre recebe false, não 401.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, createdAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const viewer = await getCurrentUser();
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
      createdAt: target.createdAt.toISOString(),
      followerCount,
      followingCount,
      postCount,
      isFollowedByMe,
    },
  });
}
