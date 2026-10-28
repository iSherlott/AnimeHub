import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { EMAIL_PATTERN, generateTempPassword, MAX_EMAIL_LENGTH, MAX_NAME_LENGTH } from "@/lib/auth/accounts";
import { normalizeHandle, validateHandle } from "@/lib/handle";

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      handle: true,
      role: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

/**
 * Cria a conta de uma pessoa (sistema fechado: não existe cadastro aberto). `{ email, displayName, handle }`; o nome de
 * usuário (@) é obrigatório e fixo — só o administrador o define (aqui ou depois, em PATCH /api/admin/users/[id]). A conta nasce
 * sempre como MEMBER — qualquer outro campo enviado (papel inclusive) é ignorado — com uma senha provisória que é
 * devolvida só nesta resposta, para o administrador repassar por fora; no primeiro login a pessoa troca a senha.
 */
export async function POST(request: Request) {
  const { user: admin, response } = await requireAdmin();
  if (!admin) return response;

  const body = (await request.json().catch(() => null)) as { email?: unknown; displayName?: unknown; handle?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const handle = typeof body?.handle === "string" ? normalizeHandle(body.handle) : "";
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: "Informe o nome da pessoa." }, { status: 400 });
  if (displayName.length > MAX_NAME_LENGTH) return NextResponse.json({ error: `Nome muito longo (máximo ${MAX_NAME_LENGTH} caracteres).` }, { status: 400 });
  const handleProblem = validateHandle(handle);
  if (handleProblem) return NextResponse.json({ error: `${handleProblem}.` }, { status: 400 });

  const temporaryPassword = generateTempPassword();
  const { hash, salt } = await hashPassword(temporaryPassword);
  try {
    const created = await prisma.user.create({
      data: { email, displayName, handle, passwordHash: hash, passwordSalt: salt, role: "MEMBER", mustChangePassword: true },
      select: { id: true, email: true, displayName: true, handle: true, role: true, mustChangePassword: true, createdAt: true },
    });
    await prisma.adminLog.create({
      data: { level: "INFO", event: "Account created", message: `${admin.displayName} criou a conta de ${created.displayName} (${created.email}).`, context: `user:${created.id}`, adminName: admin.displayName },
    });
    return NextResponse.json({ user: created, temporaryPassword }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const onHandle = JSON.stringify(error.meta?.target ?? "").includes("handle");
      return NextResponse.json({ error: onHandle ? "Esse nome de usuário já está em uso." : "Já existe uma conta com esse e-mail." }, { status: 409 });
    }
    throw error;
  }
}
