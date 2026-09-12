import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Par fixo (não corresponde a nenhuma senha real) usado só pra gastar o
 * mesmo tempo de scrypt quando o e-mail não existe — sem isso, "usuário não
 * encontrado" responde quase instantâneo enquanto "senha errada" gasta o
 * tempo real do hash, e dá pra descobrir por timing quais e-mails têm conta.
 */
export const DUMMY_HASH = {
  hash: "0".repeat(KEY_LENGTH * 2),
  salt: "0".repeat(32),
};

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}
