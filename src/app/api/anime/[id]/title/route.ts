import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  const titlePortuguese: string | null =
    typeof body.titlePortuguese === "string" && body.titlePortuguese.trim()
      ? body.titlePortuguese.trim()
      : null;

  const anime = await prisma.anime.update({
    where: { id },
    data: { titlePortuguese },
  });

  return NextResponse.json({ anime });
}
