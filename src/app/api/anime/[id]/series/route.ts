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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const seriesKey: string | null =
    typeof body.seriesKey === "string" ? body.seriesKey.trim().toLowerCase() : null;
  const seasonNumber = Number(body.seasonNumber);

  if (!seriesKey || !Number.isInteger(seasonNumber) || seasonNumber < 1) {
    return NextResponse.json(
      { error: "seriesKey e seasonNumber (inteiro >= 1) são obrigatórios" },
      { status: 400 }
    );
  }

  // Sem essa checagem, 2 animes do mesmo usuário podiam ficar com o mesmo
  // seriesKey+seasonNumber ao mesmo tempo — o SeasonSwitcher renderizava 2
  // chips idênticos de "Temporada N" lado a lado, sem crashar mas
  // confuso/quebrado visualmente (achado real da 9ª rodada de auditoria,
  // Epic 18). Checagem prévia (não constraint no banco) porque reorganizar
  // temporadas manualmente pode legitimamente precisar de um estado
  // intermediário passageiro — bloquear só a colisão final, não o meio do
  // caminho.
  const conflict = await prisma.anime.findFirst({
    where: { userId: user.id, seriesKey, seasonNumber, NOT: { id } },
    select: { id: true, titleRomaji: true },
  });
  if (conflict) {
    return NextResponse.json(
      { error: `"${conflict.titleRomaji}" já está na Temporada ${seasonNumber} desse agrupamento` },
      { status: 409 }
    );
  }

  const anime = await prisma.anime.update({
    where: { id },
    data: { seriesKey, seasonNumber },
  });

  return NextResponse.json({ anime });
}
