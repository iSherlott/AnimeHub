import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const anidbId =
    typeof body.anidbId === "number" && Number.isInteger(body.anidbId) && body.anidbId > 0
      ? body.anidbId
      : null;

  const anime = await prisma.anime.update({ where: { id }, data: { anidbId } });
  return NextResponse.json({ anime });
}
