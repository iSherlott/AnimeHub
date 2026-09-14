import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "Não é possível seguir a si mesmo" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const following = Boolean(body.following);

  if (following) {
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: user.id, followingId: id } },
      create: { followerId: user.id, followingId: id },
      update: {},
    });
  } else {
    await prisma.follow.deleteMany({ where: { followerId: user.id, followingId: id } });
  }

  const followerCount = await prisma.follow.count({ where: { followingId: id } });
  return NextResponse.json({ following, followerCount });
}
