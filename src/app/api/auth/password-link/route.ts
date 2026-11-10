import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";
import { newPasswordProblem } from "@/lib/auth/accounts";
import { PASSWORD_LINK_PROBLEM, readPasswordLink } from "@/lib/auth/passwordLinks";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";

const LIMIT = 20;
const WINDOW_MS = 15 * 60 * 1000;

/** `?codigo=` → de quem é o link e se ainda vale (a página mostra "Olá, Fulano" antes do formulário). */
export async function GET(request: Request) {
  const limited = rateLimitedResponse(`password-link:${clientIp(request)}`, LIMIT, WINDOW_MS);
  if (limited) return limited;
  const state = await readPasswordLink(new URL(request.url).searchParams.get("codigo"));
  if (!state.ok) return NextResponse.json({ ok: false, error: PASSWORD_LINK_PROBLEM[state.reason], reason: state.reason }, { status: 410 });
  return NextResponse.json({ ok: true, displayName: state.displayName, handle: state.handle });
}

/**
 * `{ codigo, password }`: a pessoa define a própria senha pelo link que o admin mandou. O link vale uma vez; a senha
 * provisória e as sessões abertas deixam de valer, e a pessoa já entra logada.
 */
export async function POST(request: Request) {
  const limited = rateLimitedResponse(`password-link:${clientIp(request)}`, LIMIT, WINDOW_MS);
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { codigo?: unknown; password?: unknown } | null;
  const now = new Date();
  const state = await readPasswordLink(body?.codigo, now);
  if (!state.ok) return NextResponse.json({ error: PASSWORD_LINK_PROBLEM[state.reason], reason: state.reason }, { status: 410 });
  const password = typeof body?.password === "string" ? body.password : "";
  const problem = newPasswordProblem(password, "");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { hash, salt } = await hashPassword(password);
  // Gasta o link só se ninguém o gastou no meio do caminho (dois cliques ao mesmo tempo: só um vale).
  const spent = await prisma.passwordLink.updateMany({ where: { id: state.linkId, usedAt: null }, data: { usedAt: now } });
  if (spent.count === 0) return NextResponse.json({ error: PASSWORD_LINK_PROBLEM.used, reason: "used" }, { status: 410 });
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: state.userId }, data: { passwordHash: hash, passwordSalt: salt, mustChangePassword: false } }),
    prisma.session.deleteMany({ where: { userId: state.userId } }),
    prisma.passwordLink.updateMany({ where: { userId: state.userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } }),
  ]);
  await createSession(state.userId);
  return NextResponse.json({ user: toPublicUser(updated) });
}
