import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Quanto tempo o link vale: dá tempo de a pessoa ver a mensagem, sem deixar uma porta aberta por semanas. */
export const PASSWORD_LINK_TTL_MS = 48 * 3600 * 1000;
export const PASSWORD_LINK_PATH = "/definir-senha";

/** O código vai só no link; no banco fica o hash dele (quem lê o banco não consegue usar o link). */
export function hashPasswordToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Código bem-formado: 43 caracteres base64url (32 bytes). Qualquer outra coisa nem chega ao banco. */
export function isWellFormedPasswordToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/**
 * Gera o link de "defina sua senha" de uma pessoa. Os links anteriores dela que não foram usados deixam de valer: só o
 * último que o admin mandou funciona.
 */
export async function createPasswordLink(userId: string, createdById: string | null, now = new Date()): Promise<{ path: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + PASSWORD_LINK_TTL_MS);
  await prisma.$transaction([
    prisma.passwordLink.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } }),
    prisma.passwordLink.create({ data: { tokenHash: hashPasswordToken(token), userId, createdById, expiresAt } }),
  ]);
  return { path: `${PASSWORD_LINK_PATH}?codigo=${token}`, expiresAt };
}

export type PasswordLinkState =
  | { ok: true; linkId: string; userId: string; displayName: string; handle: string | null }
  | { ok: false; reason: "invalid" | "used" | "expired" };

/** Confere o link sem gastá-lo (a página mostra o nome da pessoa antes de ela digitar a senha). */
export async function readPasswordLink(token: unknown, now = new Date()): Promise<PasswordLinkState> {
  if (!isWellFormedPasswordToken(token)) return { ok: false, reason: "invalid" };
  const link = await prisma.passwordLink.findUnique({
    where: { tokenHash: hashPasswordToken(token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { displayName: true, handle: true } } },
  });
  if (!link) return { ok: false, reason: "invalid" };
  if (link.usedAt) return { ok: false, reason: "used" };
  if (link.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, linkId: link.id, userId: link.userId, displayName: link.user.displayName, handle: link.user.handle };
}

export const PASSWORD_LINK_PROBLEM: Record<"invalid" | "used" | "expired", string> = {
  invalid: "Este link não é válido. Peça um novo à administração.",
  used: "Este link já foi usado. Se precisar trocar a senha de novo, peça um novo link à administração.",
  expired: "Este link venceu. Peça um novo à administração.",
};
