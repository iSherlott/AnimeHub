import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession, toPublicUser } from "@/lib/auth/session";
import { clientIp, hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 200;
const MAX_NAME_LENGTH = 60;
const MAX_INVITE_LENGTH = 100;

// Cadastros por IP: limita tentativa de adivinhar convites e de enumerar e-mails.
const SIGNUP_LIMIT = 20;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

// Mesma resposta para "convite inválido" e "e-mail já existe": quem não tem
// um convite válido nunca descobre se um e-mail está cadastrado (GAP-S-03).
const INVALID_SIGNUP = { error: "Convite inválido ou já utilizado" };
const ACCOUNT_NOT_CREATED = {
  error: "Não foi possível criar a conta com esses dados. Se você já tem conta, entre.",
};

// Trava transacional para a decisão "primeira conta do sistema vira admin":
// sem ela, dois cadastros simultâneos num banco vazio podiam ambos virar ADMIN.
const FIRST_USER_LOCK_KEY = 71_001;

export async function POST(request: Request) {
  const limit = hitRateLimit(`signup:${clientIp(request)}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSec);

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
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` },
      { status: 400 }
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "Senha longa demais" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: "Nome de exibição é obrigatório" }, { status: 400 });
  }
  if (displayName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Nome de exibição muito longo (máximo ${MAX_NAME_LENGTH} caracteres)` },
      { status: 400 }
    );
  }
  if (inviteCode.length > MAX_INVITE_LENGTH) {
    return NextResponse.json(INVALID_SIGNUP, { status: 400 });
  }

  const { hash, salt } = await hashPassword(password);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${FIRST_USER_LOCK_KEY})`);

      // Cadastro é só por convite — exceto a primeiríssima conta do sistema,
      // que vira administrador (não existe ninguém ainda pra convidá-la).
      const isFirstEverUser = (await tx.user.count()) === 0;

      let inviteId: string | null = null;
      if (!isFirstEverUser) {
        const invite = inviteCode ? await tx.invite.findUnique({ where: { code: inviteCode } }) : null;
        if (!invite || invite.usedById || (invite.expiresAt && invite.expiresAt < new Date())) {
          throw new Error("INVALID_INVITE");
        }
        inviteId = invite.id;
      }

      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new Error("EMAIL_TAKEN");
      }

      const created = await tx.user.create({
        data: {
          email,
          passwordHash: hash,
          passwordSalt: salt,
          displayName,
          role: isFirstEverUser ? "ADMIN" : "MEMBER",
        },
      });

      if (inviteId) {
        // updateMany + checar count em vez de update simples: garante que,
        // se duas pessoas tentarem usar o mesmo código ao mesmo tempo, só
        // uma consegue (a outra recebe INVALID_INVITE e a transação
        // inteira é desfeita, sem criar o usuário órfão).
        const claim = await tx.invite.updateMany({
          where: { id: inviteId, usedById: null },
          data: { usedById: created.id, usedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new Error("INVALID_INVITE");
        }
      }

      // A primeira conta herda os dados que ainda não tinham dono (a lista
      // pessoal de antes de existir login) — evita precisar de um script de
      // migração manual só pra "ativar" a conta real depois.
      if (isFirstEverUser) {
        await tx.anime.updateMany({ where: { userId: null }, data: { userId: created.id } });
      }

      return created;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_INVITE") {
      return NextResponse.json(INVALID_SIGNUP, { status: 400 });
    }
    if (
      (error instanceof Error && error.message === "EMAIL_TAKEN") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return NextResponse.json(ACCOUNT_NOT_CREATED, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Falha ao criar a conta" }, { status: 500 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
}
