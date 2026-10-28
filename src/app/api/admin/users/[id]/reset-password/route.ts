import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/session";
import { generateTempPassword } from "@/lib/auth/accounts";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { user: admin, response } = await requireAdmin();
  if (!admin) return response;

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();
  const { hash, salt } = await hashPassword(tempPassword);

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        // Provisória: no próximo login a pessoa troca por uma dela.
        data: { passwordHash: hash, passwordSalt: salt, mustChangePassword: true },
      }),
      // Derruba todas as sessões ativas dessa pessoa — a senha mudou, ela
      // precisa entrar de novo com a nova.
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Falha ao resetar a senha" }, { status: 500 });
  }

  // Não existe sistema de e-mail — a senha temporária só é exibida aqui,
  // uma vez, pro administrador repassar por fora.
  return NextResponse.json({ temporaryPassword: tempPassword });
}
