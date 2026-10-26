import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getQuizState } from "@/lib/quiz";
import { resolveWorkKey } from "@/lib/workRef";

type Params = { params: Promise<{ anilistId: string }> };

/** Estado do quiz da obra para quem pergunta (público; o estado pessoal só vem com sessão). Nunca traz perguntas. */
export async function GET(_request: Request, { params }: Params) {
  // A chave é o AniList ID ou, para obra sem ele, `anidb-<id>`/`kitsu-<id>`.
  const work = await resolveWorkKey((await params).anilistId);
  if (!work) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  const user = await getCurrentUser();
  return NextResponse.json(await getQuizState(work, user?.id ?? null));
}
