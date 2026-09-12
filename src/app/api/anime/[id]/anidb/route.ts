import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  const body = await request.json();

  const anidbId =
    typeof body.anidbId === "number" && Number.isInteger(body.anidbId) && body.anidbId > 0
      ? body.anidbId
      : null;

  const anime = await prisma.anime.update({ where: { id }, data: { anidbId } });
  return NextResponse.json({ anime });
}
