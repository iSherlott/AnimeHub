import { NextResponse } from "next/server";
import { notifySocial } from "@/lib/socialNotifications";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { blockRelation } from "@/lib/blocks";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "Não é possível seguir a si mesmo" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target || (await blockRelation(user.id, id)) !== "none") {
    // Mensagem neutra: não revela se existe bloqueio nem de que lado.
    return NextResponse.json({ error: "Perfil indisponível" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  // Ver src/app/api/anime/[id]/favorite/route.ts — mesma correção pro
  // mesmo anti-padrão (achado real da 10ª rodada de auditoria, Epic 18).
  if (typeof body.following !== "boolean") {
    return NextResponse.json({ error: "following deve ser um booleano" }, { status: 400 });
  }
  const following = body.following;

  if (following) {
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: user.id, followingId: id } },
      create: { followerId: user.id, followingId: id },
      update: {},
    });
    await notifySocial({ type: "NEW_FOLLOWER", recipientId: id, actorId: user.id });
  } else {
    await prisma.follow.deleteMany({ where: { followerId: user.id, followingId: id } });
  }

  const followerCount = await prisma.follow.count({ where: { followingId: id } });
  return NextResponse.json({ following, followerCount });
}
