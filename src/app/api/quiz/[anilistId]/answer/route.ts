import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { submitAnswer } from "@/lib/quiz";
import { parseAnilistId, quizErrorResponse } from "@/lib/quizHttp";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ anilistId: string }> };

/** Confirma a resposta da pergunta `position`. A resposta nunca diz se acertou; só o resultado final traz a nota. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const anilistId = parseAnilistId((await params).anilistId);
  if (!anilistId) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  const limited = rateLimitedResponse(`quiz-answer:${user.id}`, 120, 10 * 60_000);
  if (limited) return limited;

  let body: { position?: unknown; choice?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitAnswer(anilistId, user.id, Number(body.position), body.choice));
  } catch (error) {
    return quizErrorResponse(error);
  }
}
