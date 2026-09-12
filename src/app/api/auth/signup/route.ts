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
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

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

  // Cadastro é só por convite — exceto a primeiríssima conta do sistema, que
  // vira administrador (não existe ninguém ainda pra convidá-la).
  const isFirstEverUser = (await prisma.user.count()) === 0;
  let invite = null;
  if (!isFirstEverUser) {
    if (!inviteCode) {
      return NextResponse.json({ error: "Convite é obrigatório" }, { status: 400 });
    }
    invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.usedById || (invite.expiresAt && invite.expiresAt < new Date())) {
      return NextResponse.json({ error: "Convite inválido ou já utilizado" }, { status: 400 });
    }
  }

  const { hash, salt } = await hashPassword(password);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: hash,
          passwordSalt: salt,
          displayName,
          role: isFirstEverUser ? "ADMIN" : "MEMBER",
        },
      });

      if (invite) {
        // updateMany + checar count em vez de update simples: garante que,
        // se duas pessoas tentarem usar o mesmo código ao mesmo tempo, só
        // uma consegue (a outra recebe INVITE_ALREADY_USED e a transação
        // inteira é desfeita, sem criar o usuário órfão).
        const claim = await tx.invite.updateMany({
          where: { id: invite.id, usedById: null },
          data: { usedById: created.id, usedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new Error("INVITE_ALREADY_USED");
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
    if (error instanceof Error && error.message === "INVITE_ALREADY_USED") {
      return NextResponse.json({ error: "Convite inválido ou já utilizado" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Falha ao criar a conta" }, { status: 500 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
}
