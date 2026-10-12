import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { deleteQuiz, setApproval } from "@/lib/quizAdmin";

type Params = { params: Promise<{ id: string }> };

/** Aprovar / voltar para revisão: uma pergunta (`questionId`) ou todas. */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  let body: { approved?: unknown; questionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  if (typeof body.approved !== "boolean") return NextResponse.json({ error: "Informe approved (true/false)." }, { status: 400 });
  const questionId = typeof body.questionId === "string" ? body.questionId : undefined;
  const changed = await setApproval((await params).id, body.approved, { id: user.id, name: user.displayName }, questionId);
  if (changed === null) return NextResponse.json({ error: "Quiz não encontrado." }, { status: 404 });
  return NextResponse.json({ changed });
}

/** Remove o quiz — só se ninguém respondeu. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const result = await deleteQuiz((await params).id, { id: user.id, name: user.displayName });
  if (result === "not-found") return NextResponse.json({ error: "Quiz não encontrado." }, { status: 404 });
  if (result === "has-attempts") return NextResponse.json({ error: "Este quiz já tem tentativas ou títulos concedidos e não pode ser removido." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
