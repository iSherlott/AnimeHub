import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { submitAnswer } from "@/lib/quiz";
import { quizErrorResponse } from "@/lib/quizHttp";
import { resolveWorkKey } from "@/lib/workRef";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ anilistId: string }> };

/** Confirma a resposta da pergunta `position`. A resposta nunca diz se acertou; só o resultado final traz a nota. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  // A chave é o AniList ID ou, para obra sem ele, `anidb-<id>`/`kitsu-<id>`.
  const work = await resolveWorkKey((await params).anilistId);
  if (!work) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  const limited = rateLimitedResponse(`quiz-answer:${user.id}`, 120, 10 * 60_000);
  if (limited) return limited;

  let body: { position?: unknown; choice?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitAnswer(work, user.id, Number(body.position), body.choice));
  } catch (error) {
    return quizErrorResponse(error);
  }
}
