import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const platform: string = body.platform;
  const url: string = body.url;

  if (!platform || !url) {
    return NextResponse.json(
      { error: "platform e url são obrigatórios" },
      { status: 400 }
    );
  }

  const link = await prisma.platformLink.upsert({
    where: { animeId_platform: { animeId: id, platform } },
    update: { url },
    create: { animeId: id, platform, url },
  });

  return NextResponse.json({ link }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const linkId = request.nextUrl.searchParams.get("linkId");

  if (!linkId) {
    return NextResponse.json({ error: "linkId é obrigatório" }, { status: 400 });
  }

  await prisma.platformLink.delete({ where: { id: linkId, animeId: id } });
  return NextResponse.json({ ok: true });
}
