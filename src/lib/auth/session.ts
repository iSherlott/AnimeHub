import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import type { UserPreferences } from "@/lib/userSettings";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 dias

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  role: string;
  preferences: UserPreferences;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    role: user.role,
    preferences: {
      titleFormat: user.titleFormat === "ja" || user.titleFormat === "romaji" ? user.titleFormat : null,
      synopsisLanguage: user.synopsisLanguage === "pt" || user.synopsisLanguage === "ja" ? user.synopsisLanguage : null,
      timeZone: user.timeZone,
      notifyReleases: user.notifyReleases,
      notifyReplies: user.notifyReplies,
      notifyComments: user.notifyComments,
      notifyFollowers: user.notifyFollowers,
      notifyLikes: user.notifyLikes,
      animeListPublic: user.animeListPublic,
    },
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

/**
 * Como requireUser(), mas também exige role === "ADMIN". Uso:
 *   const { user, response } = await requireAdmin();
 *   if (!user) return response;
 */
export async function requireAdmin(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const { user, response } = await requireUser();
  if (!user) return { user: null, response };
  if (user.role !== "ADMIN") {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Apenas administradores podem fazer isso" },
        { status: 403 }
      ),
    };
  }
  return { user, response: null };
}
