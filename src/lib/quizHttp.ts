import { NextResponse } from "next/server";
import { QuizError, type QuizErrorCode } from "@/lib/quiz";

const STATUS: Record<QuizErrorCode, number> = {
  NOT_FOUND: 404,
  UNAVAILABLE: 409,
  NOT_FOLLOWING: 403,
  ALREADY_COMPLETED: 409,
  NO_ATTEMPT: 409,
  BAD_ANSWER: 400,
};

/** Converte um QuizError em resposta HTTP (código estável para a interface + mensagem em português). */
export function quizErrorResponse(error: unknown): NextResponse {
  if (error instanceof QuizError) return NextResponse.json({ error: error.message, code: error.code }, { status: STATUS[error.code] });
  throw error;
}

export function parseAnilistId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}
