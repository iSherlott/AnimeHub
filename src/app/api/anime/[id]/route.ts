import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    include: { platformLinks: true, progress: true },
  });

  if (!anime) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ anime });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
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
