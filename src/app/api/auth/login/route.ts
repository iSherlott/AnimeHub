import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";
import { clientIp, hitRateLimit, peekRateLimit, resetRateLimit, tooManyRequests } from "@/lib/rateLimit";

// Só FALHAS contam: quem erra a senha 5x para a mesma conta (por IP) espera
// 15 min; um IP que falha 30x seguidas em contas diferentes também espera.
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const PER_ACCOUNT_LIMIT = 5;
const PER_IP_LIMIT = 30;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 200;

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios" }, { status: 400 });
  }
  if (email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "E-mail ou senha incorretos" }, { status: 401 });
  }

  const ip = clientIp(request);
  const accountKey = `login-fail:${ip}:${email}`;
  const ipKey = `login-fail-ip:${ip}`;
  const accountState = peekRateLimit(accountKey, PER_ACCOUNT_LIMIT);
  const ipState = peekRateLimit(ipKey, PER_IP_LIMIT);
  if (!accountState.allowed || !ipState.allowed) {
    return tooManyRequests(Math.max(accountState.retryAfterSec, ipState.retryAfterSec));
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = { error: "E-mail ou senha incorretos" };

  // Sempre roda o hash (real ou o par fixo) pra não vazar por timing se o
  // e-mail existe ou não — ver DUMMY_HASH.
  const valid = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_HASH.hash,
    user?.passwordSalt ?? DUMMY_HASH.salt
  );
  if (!user || !valid) {
    hitRateLimit(accountKey, PER_ACCOUNT_LIMIT, FAILURE_WINDOW_MS);
    hitRateLimit(ipKey, PER_IP_LIMIT, FAILURE_WINDOW_MS);
    return NextResponse.json(genericError, { status: 401 });
  }

  resetRateLimit(accountKey);
  await createSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) });
}
