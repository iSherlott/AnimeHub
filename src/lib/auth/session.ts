import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 dias

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { token, userId, expiresAt } });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/**
 * Helper pra rotas de API que exigem sessão ativa. Uso:
 *   const { user, response } = await requireUser();
 *   if (!user) return response;
 */
export async function requireUser(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Faça login para continuar" }, { status: 401 }),
    };
  }
  return { user, response: null };
}
