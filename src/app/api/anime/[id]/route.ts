import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    include: { platformLinks: true, progress: true },
  });

  if (!anime || anime.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ anime });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  try {
    await prisma.anime.delete({ where: { id } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Falha ao remover o anime" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
