import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { recomputeSiteScore } from "@/lib/siteScoreDb";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    include: { platformLinks: true },
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
  const existing = await prisma.anime.findUnique({
    where: { id },
    select: { id: true, userId: true, anilistId: true, catalogEntryId: true },
  });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  try {
    // AiringAlert não tem FK pro Anime — é chaveado por (userId, anilistId,
    // episode), pensado assim de propósito pra sobreviver um anime sendo
    // removido e re-adicionado (não perde o "já visto"). Mas sem limpar na
    // hora de remover de vez, um alerta de "no ar agora" ficava órfão
    // (animeId nulo em tudo que o BFF resolve) até a retenção de 7 dias do
    // notifier expirar — inflando a contagem de não-vistos com uma entrada
    // que não leva a lugar nenhum (achado real da 15ª rodada de auditoria,
    // Epic 18).
    await prisma.$transaction([
      // Obra sem AniList ID (só do AniDB/Kitsu) não gera alerta: nada a limpar.
      ...(existing.anilistId !== null ? [prisma.airingAlert.deleteMany({ where: { userId: user.id, anilistId: existing.anilistId } })] : []),
      prisma.anime.delete({ where: { id } }),
    ]);
    // A nota de quem sai da lista deixa de contar na nota do site.
    await recomputeSiteScore(existing).catch(() => undefined);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Falha ao remover o anime" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
