import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

/**
 * "Espera": põe a obra da própria lista em modo de espera (`{ waiting: true }`) ou a retoma (`false`). Em espera a
 * obra continua na lista e no perfil, mas sai do calendário "Minha Lista", dos alertas de lançamento e de
 * "Para assistir" — é para o que a pessoa não vai acompanhar no lançamento (já viu alguns episódios).
 */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { userId: true, anilistId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (typeof body.waiting !== "boolean") {
    return NextResponse.json({ error: "waiting deve ser um booleano" }, { status: 400 });
  }
  const waiting: boolean = body.waiting;

  const current = await prisma.anime.findUnique({ where: { id }, select: { watchState: true } });
  // Voltar a acompanhar uma obra dropada desfaz o "dropei" (a agenda e o "dropei" não podem discordar).
  const clearDropped = !waiting && current?.watchState === "DROPPED";
  const anime = await prisma.anime.update({ where: { id }, data: { waiting, waitingSince: waiting ? new Date() : null, ...(clearDropped ? { watchState: null } : {}) } });
  // Quem entra em espera não tem mais episódio "adiado" para ver.
  if (waiting && existing.anilistId !== null) await prisma.pendingEpisode.deleteMany({ where: { userId: user.id, anilistId: existing.anilistId } });

  return NextResponse.json({ anime: { id: anime.id, waiting: anime.waiting, waitingSince: anime.waitingSince } });
}
