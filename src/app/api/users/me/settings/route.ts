import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, toPublicUser } from "@/lib/auth/session";
import { validateSettingsPatch } from "@/lib/userSettings";

/**
 * Preferências da própria conta (Configurações). Sempre opera sobre o
 * usuário da sessão — não existe rota para editar a de outra pessoa.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ preferences: toPublicUser(user).preferences });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const result = validateSettingsPatch(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data: result.patch });
  return NextResponse.json({ preferences: toPublicUser(updated).preferences });
}
