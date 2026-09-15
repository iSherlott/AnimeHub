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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  // null/undefined desvincula de propósito — qualquer outro valor que não
  // seja um inteiro positivo é rejeitado, não silenciosamente virado null
  // (achado real da 5ª rodada de auditoria, Epic 18: um valor não numérico
  // era descartado sem nenhum aviso, como se tivesse sido salvo).
  let anidbId: number | null;
  if (body.anidbId === null || body.anidbId === undefined) {
    anidbId = null;
  } else if (typeof body.anidbId === "number" && Number.isInteger(body.anidbId) && body.anidbId > 0) {
    anidbId = body.anidbId;
  } else {
    return NextResponse.json(
      { error: "ID da AniDB deve ser um número inteiro positivo" },
      { status: 400 }
    );
  }

  const anime = await prisma.anime.update({ where: { id }, data: { anidbId } });
  return NextResponse.json({ anime });
}
