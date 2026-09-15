import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isBlank } from "@/lib/text";

type Params = { params: Promise<{ id: string }> };

// Título é um campo curto por natureza — mesmo o título oficial mais longo
// de um anime real fica bem abaixo disso. Sem limite nenhum, um valor de
// milhares de caracteres era salvo (200 OK) e o <h1> da página do anime
// renderizava a string inteira sem quebra, estourando o layout horizontal
// (achado real da 11ª rodada de auditoria, Epic 18).
const MAX_TITLE_LENGTH = 200;

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  const body = await request.json();

  const raw = typeof body.titlePortuguese === "string" ? body.titlePortuguese.trim() : "";
  if (raw.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      { error: `Título muito longo (máximo ${MAX_TITLE_LENGTH} caracteres)` },
      { status: 400 }
    );
  }
  // isBlank (não só .trim()) — um título só de zero-width space passava
  // pelo .trim() como "não vazio" e vencia o fallback pro romaji/inglês
  // na hora de exibir (achado real da 11ª rodada de auditoria, Epic 18).
  const titlePortuguese: string | null = isBlank(raw) ? null : raw;

  const anime = await prisma.anime.update({
    where: { id },
    data: { titlePortuguese },
  });

  return NextResponse.json({ anime });
}
