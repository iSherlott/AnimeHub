import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { WATCH_STATUSES } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const anime = await prisma.anime.findUnique({ where: { id }, select: { id: true } });
  if (!anime) {
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

  if (body.episodeProgress !== undefined) {
    const value = Number(body.episodeProgress);
    if (Number.isNaN(value)) {
      return NextResponse.json({ error: "episodeProgress inválido" }, { status: 400 });
    }
    data.episodeProgress = value;
  }
  if (body.score !== undefined) {
    if (body.score === null) {
      data.score = null;
    } else {
      const value = Number(body.score);
      if (Number.isNaN(value)) {
        return NextResponse.json({ error: "score inválido" }, { status: 400 });
      }
      data.score = value;
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
