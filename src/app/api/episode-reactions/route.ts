import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { loadEpisodeReactions, saveEpisodeReaction } from "@/lib/episodeReactions";

/**
 * Reações, notas e diário por episódio (10/11/2026).
 * GET `?obra=<chave>` → a curva da temporada (só números) e o registro de quem pede (o diário é só dela).
 * PUT `{ work, episode, emoji?, rating?, note? }` → grava o registro do episódio (tudo vazio apaga).
 */
export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const work = new URL(request.url).searchParams.get("obra") ?? "";
  const data = await loadEpisodeReactions(work, user.id);
  if (!data) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await saveEpisodeReaction(user.id, body ?? {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ entry: result.entry });
}
