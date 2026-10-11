import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { abandonAttempt, currentQuestion, startAttempt } from "@/lib/quiz";
import { parseAnilistId, quizErrorResponse } from "@/lib/quizHttp";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ anilistId: string }> };

/** Inicia (ou retoma) a tentativa. Iniciar é o consentimento de spoiler: as perguntas só saem depois disto. */
export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const anilistId = parseAnilistId((await params).anilistId);
  if (!anilistId) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  const limited = rateLimitedResponse(`quiz-start:${user.id}`, 30, 10 * 60_000);
  if (limited) return limited;
  try {
    return NextResponse.json(await startAttempt(anilistId, user.id), { status: 201 });
  } catch (error) {
    return quizErrorResponse(error);
  }
}

/** Pergunta atual da tentativa em andamento (sem o gabarito). */
export async function GET(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const anilistId = parseAnilistId((await params).anilistId);
  if (!anilistId) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  try {
    return NextResponse.json({ question: await currentQuestion(anilistId, user.id) });
  } catch (error) {
    return quizErrorResponse(error);
  }
}

/** Abandonar: sem recompensa; a coleção e o título atual não mudam. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const anilistId = parseAnilistId((await params).anilistId);
  if (!anilistId) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  await abandonAttempt(anilistId, user.id);
  return NextResponse.json({ ok: true });
}
