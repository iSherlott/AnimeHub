import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { parseQuizImport } from "@/lib/quizImport";
import { importQuizzes } from "@/lib/quizAdmin";

/**
 * Admin → Quizzes → "Carregar perguntas": JSON (um quiz ou uma lista) ou CSV `;` de um anime.
 * `dryRun: true` só valida e mostra o que seria gravado. Sem `approve`, as perguntas entram para
 * revisão (o quiz só fica disponível com as 10 aprovadas). Tudo ou nada.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;

  let body: { text?: unknown; anilistId?: unknown; work?: unknown; scope?: unknown; titleReward?: unknown; approve?: unknown; dryRun?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: ["Corpo da requisição inválido."] }, { status: 400 });
  }
  // "ID da obra" do formulário (só para CSV): o número da AniList ou `anidb-<id>`/`kitsu-<id>`.
  const work = typeof body.work === "string" && body.work.trim() ? body.work.trim() : body.anilistId !== undefined && body.anilistId !== null && body.anilistId !== "" ? String(body.anilistId).trim() : null;
  const parsed = parseQuizImport(typeof body.text === "string" ? body.text : "", {
    work,
    scope: typeof body.scope === "string" ? body.scope : null,
    titleReward: typeof body.titleReward === "string" ? body.titleReward : null,
  });
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 422 });

  if (body.dryRun === true) {
    return NextResponse.json({ dryRun: true, quizzes: parsed.quizzes.map((q) => ({ anilistId: q.anilistId, work: q.work, scope: q.scope, titleReward: q.titleReward, questions: q.questions.length })) });
  }
  const result = await importQuizzes(parsed.quizzes, { approve: body.approve === true, actor: { id: user.id, name: user.displayName } });
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 409 });
  return NextResponse.json({ outcomes: result.outcomes }, { status: 201 });
}
