import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isBlank } from "@/lib/text";
import { normalizeHandle, validateHandle } from "@/lib/handle";

// Bio é 1 linha/parágrafo curto de "sobre mim", não um texto livre tipo
// descrição de anime (5000) — 300 é generoso o bastante pra 2-3 frases
// sem estourar o layout do cabeçalho do perfil.
const MAX_BIO_LENGTH = 300;
const MAX_DISPLAY_NAME_LENGTH = 40;

/**
 * Edição do próprio perfil (Epic 28; PROF-001/002) — nome, @identificador
 * e bio, cada campo opcional (só o que vier no corpo é alterado). Sempre
 * opera sobre `user.id` da sessão ativa, nunca sobre um `id` de rota; não
 * existe (e não deveria existir) um jeito de editar o perfil de outra
 * pessoa.
 */
export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const data: Prisma.UserUpdateInput = {};

  if ("bio" in body) {
    const raw = typeof body.bio === "string" ? body.bio.trim() : "";
    if (raw.length > MAX_BIO_LENGTH) {
      return NextResponse.json({ error: `Bio muito longa (máximo ${MAX_BIO_LENGTH} caracteres)` }, { status: 400 });
    }
    data.bio = isBlank(raw) ? null : raw;
  }

  if ("displayName" in body) {
    const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (isBlank(name)) {
      return NextResponse.json({ error: "O nome não pode ficar vazio" }, { status: 400 });
    }
    if ([...name].length > MAX_DISPLAY_NAME_LENGTH) {
      return NextResponse.json({ error: `Nome muito longo (máximo ${MAX_DISPLAY_NAME_LENGTH} caracteres)` }, { status: 400 });
    }
    data.displayName = name;
  }

  if ("handle" in body) {
    const handle = typeof body.handle === "string" ? normalizeHandle(body.handle) : "";
    const problem = validateHandle(handle);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    data.handle = handle;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return NextResponse.json({ bio: updated.bio, displayName: updated.displayName, handle: updated.handle });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Esse identificador já está em uso" }, { status: 409 });
    }
    throw error;
  }
}
