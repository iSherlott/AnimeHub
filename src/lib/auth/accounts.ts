import { randomInt } from "node:crypto";

/**
 * Contas do AnimeHub (sistema fechado): só o administrador cria contas, sempre como MEMBER, com uma senha provisória
 * que a pessoa troca no primeiro login. Não existe cadastro aberto.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_NAME_LENGTH = 60;

// Sem 0/O, 1/l/I: a senha provisória é ditada ou copiada à mão por quem a recebe.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Senha provisória de 12 caracteres (≈ 69 bits), mostrada uma única vez ao administrador. */
export function generateTempPassword(): string {
  let out = "";
  for (let i = 0; i < 12; i += 1) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}

/** Problema com a nova senha escolhida pela pessoa, ou null se ela serve. */
export function newPasswordProblem(password: string, current: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `A nova senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  if (password === current) return "A nova senha precisa ser diferente da atual.";
  return null;
}
