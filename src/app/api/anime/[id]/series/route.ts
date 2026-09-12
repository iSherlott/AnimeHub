import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const seriesKey: string | null =
    typeof body.seriesKey === "string" ? body.seriesKey.trim().toLowerCase() : null;
  const seasonNumber = Number(body.seasonNumber);

  if (!seriesKey || !Number.isInteger(seasonNumber) || seasonNumber < 1) {
    return NextResponse.json(
      { error: "seriesKey e seasonNumber (inteiro >= 1) são obrigatórios" },
      { status: 400 }
    );
  }

  const anime = await prisma.anime.update({
    where: { id },
    data: { seriesKey, seasonNumber },
  });

  return NextResponse.json({ anime });
}
