import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isWatchState } from "@/lib/watchCategory";
import { syncContinuations } from "@/lib/continuation";

type Params = { params: Promise<{ id: string }> };

/**
 * Marca na mão o andamento de um anime da própria lista: `{ state: "WATCHING" | "UNFINISHED" | "FINISHED" }`, ou
 * `{ state: null }` para voltar ao automático. "DROPPED" (vi até aqui e desisti) tira a obra do calendário e dos avisos e impede que as próximas temporadas entrem sozinhas. "Terminei" encerra o que estava adiado em "Para assistir".
 * `waiting` (opcional) liga/desliga a "Espera" junto: é o "pendente" de uma obra que já terminou de ser exibida.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { userId: true, anilistId: true, watchState: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const state: unknown = body?.state;
  if (state !== null && !isWatchState(state)) {
    return NextResponse.json({ error: "state deve ser WATCHING, UNFINISHED, FINISHED ou null" }, { status: 400 });
  }

  if (body?.waiting !== undefined && typeof body.waiting !== "boolean") {
    return NextResponse.json({ error: "waiting deve ser um booleano" }, { status: 400 });
  }
  // "Dropei" tira a obra do calendário e dos avisos (como a Espera); sair dele devolve à agenda, a menos que a Espera seja pedida junto.
  const waiting: boolean | undefined = state === "DROPPED" ? true : body?.waiting !== undefined ? body.waiting : existing.watchState === "DROPPED" ? false : undefined;
  const anime = await prisma.anime.update({
    where: { id },
    data: { watchState: state, ...(waiting === undefined ? {} : { waiting, waitingSince: waiting ? new Date() : null }) },
  });
  // Terminada ou em espera, a obra não tem mais episódio "adiado" para ver.
  if (state === "FINISHED" || waiting === true) await prisma.pendingEpisode.deleteMany({ where: { userId: user.id, anilistId: existing.anilistId } });
  // Quem sai de "Dropei" pode ter continuações que ficaram sem chegar: recupera na hora.
  if (existing.watchState === "DROPPED" && state !== "DROPPED") void syncContinuations();

  return NextResponse.json({ anime: { id: anime.id, watchState: anime.watchState, waiting: anime.waiting } });
}
