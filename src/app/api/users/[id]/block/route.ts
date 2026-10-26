import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { endFriendshipOps } from "@/lib/friends";

type Params = { params: Promise<{ id: string }> };

/**
 * Bloquear (PUT) e desbloquear (DELETE) um perfil. Idempotentes. Bloquear
 * desfaz o "seguir" nos dois sentidos; desbloquear NÃO volta a seguir
 * automaticamente (Figma `13:43571`). Nunca revela se o OUTRO lado já tinha
 * bloqueado.
 */
export async function PUT(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "Você não pode bloquear a si mesmo" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "Perfil indisponível" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: id } },
      create: { blockerId: user.id, blockedId: id },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: id },
          { followerId: id, followingId: user.id },
        ],
      },
    }),
    // A amizade e os pedidos também acabam.
    ...endFriendshipOps(user.id, id),
  ]);

  return NextResponse.json({ blocked: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  await prisma.block.deleteMany({ where: { blockerId: user.id, blockedId: id } });
  return NextResponse.json({ blocked: false });
}
