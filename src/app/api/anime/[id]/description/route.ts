import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isBlank } from "@/lib/text";

type Params = { params: Promise<{ id: string }> };

// Bem mais generoso que MAX_TITLE_LENGTH (200) — é um parágrafo, não um
// título — mas ainda limitado, mesmo espírito de todo outro campo de texto
// livre desta rota família (título, comentário): sem limite nenhum aceita
// qualquer coisa e estoura o layout da coluna de descrição.
const MAX_DESCRIPTION_LENGTH = 5000;

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await prisma.anime.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  const body = await request.json();

  const raw = typeof body.descriptionPortuguese === "string" ? body.descriptionPortuguese.trim() : "";
  if (raw.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { error: `Descrição muito longa (máximo ${MAX_DESCRIPTION_LENGTH} caracteres)` },
      { status: 400 }
    );
  }
  const descriptionPortuguese: string | null = isBlank(raw) ? null : raw;

  const anime = await prisma.anime.update({
    where: { id },
    data: { descriptionPortuguese },
  });

  return NextResponse.json({ anime });
}
