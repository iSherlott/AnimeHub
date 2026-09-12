import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` },
      { status: 400 }
    );
  }
  if (!displayName) {
    return NextResponse.json({ error: "Nome de exibição é obrigatório" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Já existe uma conta com esse e-mail" }, { status: 409 });
  }

  const { hash, salt } = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash: hash, passwordSalt: salt, displayName },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Falha ao criar a conta" }, { status: 500 });
  }

  // A primeira conta criada no sistema herda os dados que ainda não tinham
  // dono (a lista pessoal de antes de existir login) — evita precisar de um
  // script de migração manual só pra "ativar" a conta real depois.
  const totalUsers = await prisma.user.count();
  if (totalUsers === 1) {
    await prisma.anime.updateMany({ where: { userId: null }, data: { userId: user.id } });
  }

  await createSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
}
