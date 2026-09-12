import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios" }, { status: 400 });
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
    return NextResponse.json(genericError, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) });
}
