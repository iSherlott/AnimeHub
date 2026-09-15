import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { WATCH_STATUSES } from "@/lib/types";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    select: { id: true, userId: true, episodes: true },
  });
  if (!anime || anime.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const data: {
    status?: string;
    episodeProgress?: number;
    score?: number | null;
    notes?: string | null;
    startedAt?: Date;
    completedAt?: Date;
  } = {};

  if (body.status !== undefined) {
    if (!WATCH_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === "WATCHING") data.startedAt = new Date();
    if (body.status === "COMPLETED") data.completedAt = new Date();
  }

  // Só a UI (ProgressEditor.tsx) manda valor pra estes 2 campos hoje, e ela
  // já clampa antes de chamar essa rota — mas a rota em si aceitava
  // qualquer number, inclusive negativo ou muito acima do total de
  // episódios, via chamada direta à API (achado real da 9ª rodada de
  // auditoria, Epic 18: PATCH episodeProgress: 999999999 era salvo e
  // renderizava assim na tela). Mesmo padrão de validação já usado pela
  // rota de anidbId — rejeita explicitamente em vez de aceitar em silêncio.
  if (body.episodeProgress !== undefined) {
    const maxEpisode = anime.episodes ?? Number.MAX_SAFE_INTEGER;
    if (
      typeof body.episodeProgress !== "number" ||
      !Number.isInteger(body.episodeProgress) ||
      body.episodeProgress < 0 ||
      body.episodeProgress > maxEpisode
    ) {
      return NextResponse.json({ error: "episodeProgress inválido" }, { status: 400 });
    }
    data.episodeProgress = body.episodeProgress;
  }
  if (body.score !== undefined) {
    if (body.score === null) {
      data.score = null;
    } else if (
      typeof body.score !== "number" ||
      !Number.isInteger(body.score) ||
      body.score < 0 ||
      body.score > 10
    ) {
      return NextResponse.json({ error: "score inválido" }, { status: 400 });
    } else {
      data.score = body.score;
    }
  }
  if (body.notes !== undefined) {
    data.notes = body.notes;
  }

  let progress;
  try {
    progress = await prisma.watchProgress.upsert({
      where: { animeId: id },
      update: data,
      create: {
        animeId: id,
        status: data.status ?? "PLAN_TO_WATCH",
        episodeProgress: data.episodeProgress ?? 0,
        score: data.score ?? null,
        notes: data.notes ?? null,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Falha ao salvar o progresso" },
      { status: 500 }
    );
  }

  return NextResponse.json({ progress });
}
