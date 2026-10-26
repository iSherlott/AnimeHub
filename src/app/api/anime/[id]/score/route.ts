import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { recomputeSiteScore } from "@/lib/siteScoreDb";
import { isValidUserScore } from "@/lib/siteScore";

type Params = { params: Promise<{ id: string }> };

/**
 * Nota (0-10) que a pessoa dá a uma obra da própria lista: `{ score: 8 }` ou `{ score: null }` para tirar. Dá para avaliar
 * qualquer obra da lista, também enquanto acompanha; mas só a nota de quem terminou de assistir ("Terminei") regula a nota do
 * site (começa em 5 e vai se ajustando às notas de quem terminou). Devolve a nota do site já recalculada.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { userId: true, anilistId: true, catalogEntryId: true } });
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });

  let body: { score?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const score = body?.score;
  if (score !== null && !isValidUserScore(score)) return NextResponse.json({ error: "score deve ser um inteiro de 0 a 10, ou null" }, { status: 400 });

  await prisma.anime.update({ where: { id }, data: { userScore: score, scoredAt: score === null ? null : new Date() } });
  const site = await recomputeSiteScore(existing);
  return NextResponse.json({ userScore: score, siteScore: site.score, siteScoreVotes: site.votes });
}
