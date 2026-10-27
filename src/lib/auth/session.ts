import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionCookieSecure } from "@/lib/auth/cookieSecure";
import { can, type Permission } from "@/lib/auth/permissions";
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
      notifyCommunity: user.notifyCommunity,
      animeListPublic: user.animeListPublic,
      recordVisits: user.recordVisits,
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
    secure: sessionCookieSecure(),
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
 * Exige sessão e a permissão da área (Fase 9): `catalog` (ADMIN, CURATOR), `moderation` (ADMIN, MODERATOR) ou `admin`
 * (só ADMIN). A recusa de quem tem sessão fica registrada no log de administração (auditoria de acessos negados). Uso:
 *   const { user, response } = await requireStaff("catalog");
 *   if (!user) return response;
 */
export async function requireStaff(permission: Permission): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const { user, response } = await requireUser();
  if (!user) return { user: null, response };
  if (!can(user.role, permission)) {
    await prisma.adminLog
      .create({ data: { level: "WARN", event: "Access denied", message: `Acesso negado: ${user.displayName} (${user.role}) sem a permissão "${permission}".`, context: `user:${user.id}` } })
      .catch(() => undefined);
    return {
      user: null,
      response: NextResponse.json(
        { error: permission === "admin" ? "Apenas administradores podem fazer isso" : "Você não tem permissão para esta área" },
        { status: 403 }
      ),
    };
  }
  return { user, response: null };
}

/** Só administradores (usuários, convites, papéis). Uso: `const { user, response } = await requireAdmin();` */
export async function requireAdmin(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  return requireStaff("admin");
}
