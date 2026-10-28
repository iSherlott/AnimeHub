import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getCurrentUser, toPublicUser } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/cookieName";
import { MAX_PASSWORD_LENGTH, newPasswordProblem } from "@/lib/auth/accounts";
import { clientIp, hitRateLimit, peekRateLimit, resetRateLimit, tooManyRequests } from "@/lib/rateLimit";

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FAILURE_LIMIT = 5;

/**
 * Troca da própria senha: `{ currentPassword, newPassword }`. É o único caminho para quem entrou com senha provisória
 * (conta criada ou senha redefinida pelo admin) — por isso usa `getCurrentUser`, não `requireUser`. Trocar encerra as
 * outras sessões da pessoa; a atual continua. Errar a senha atual 5x espera 15 min, como no login.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Faça login para continuar" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { currentPassword?: unknown; newPassword?: unknown } | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  const failKey = `password-fail:${clientIp(request)}:${user.id}`;
  const state = peekRateLimit(failKey, FAILURE_LIMIT);
  if (!state.allowed) return tooManyRequests(state.retryAfterSec);
  const valid = currentPassword.length > 0 && currentPassword.length <= MAX_PASSWORD_LENGTH && (await verifyPassword(currentPassword, user.passwordHash, user.passwordSalt));
  if (!valid) {
    hitRateLimit(failKey, FAILURE_LIMIT, FAILURE_WINDOW_MS);
    return NextResponse.json({ error: "A senha atual não confere." }, { status: 400 });
  }
  resetRateLimit(failKey);

  const problem = newPasswordProblem(newPassword, currentPassword);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { hash, salt } = await hashPassword(newPassword);
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash, passwordSalt: salt, mustChangePassword: false } }),
    prisma.session.deleteMany({ where: { userId: user.id, token: { not: token } } }),
  ]);
  return NextResponse.json({ user: toPublicUser(updated) });
}
