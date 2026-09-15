import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isValidHttpUrl } from "@/lib/url";

type Params = { params: Promise<{ id: string }> };

async function assertOwnsAnime(id: string, userId: string) {
  const anime = await prisma.anime.findUnique({ where: { id }, select: { userId: true } });
  return anime?.userId === userId;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  if (!(await assertOwnsAnime(id, user.id))) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const platform: string = body.platform;
  const url: string = body.url;

  if (!platform || !url) {
    return NextResponse.json(
      { error: "platform e url são obrigatórios" },
      { status: 400 }
    );
  }
  // Sem isso, qualquer texto virava um link "clicável" que na prática não
  // levava a lugar nenhum — nenhuma validação de formato existia, nem
  // client nem server (achado real da 5ª rodada de auditoria, Epic 18).
  if (!isValidHttpUrl(url)) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  const link = await prisma.platformLink.upsert({
    where: { animeId_platform: { animeId: id, platform } },
    update: { url },
    create: { animeId: id, platform, url },
  });

  return NextResponse.json({ link }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  if (!(await assertOwnsAnime(id, user.id))) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  const linkId = request.nextUrl.searchParams.get("linkId");

  if (!linkId) {
    return NextResponse.json({ error: "linkId é obrigatório" }, { status: 400 });
  }

  try {
    await prisma.platformLink.delete({ where: { id: linkId, animeId: id } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
