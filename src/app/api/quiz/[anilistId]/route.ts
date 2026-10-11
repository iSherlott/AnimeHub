import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getQuizState } from "@/lib/quiz";
import { parseAnilistId } from "@/lib/quizHttp";

type Params = { params: Promise<{ anilistId: string }> };

/** Estado do quiz da obra para quem pergunta (público; o estado pessoal só vem com sessão). Nunca traz perguntas. */
export async function GET(_request: Request, { params }: Params) {
  const anilistId = parseAnilistId((await params).anilistId);
  if (!anilistId) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  const user = await getCurrentUser();
  return NextResponse.json(await getQuizState(anilistId, user?.id ?? null));
}
