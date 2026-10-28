#!/usr/bin/env node
/**
 * Cria o PRIMEIRO administrador de um banco novo. O AnimeHub é fechado: as contas nascem em Admin → Acesso, e num
 * banco vazio não há quem as crie. Este comando só funciona enquanto não existe nenhum administrador; depois disso,
 * recusa (contas novas e papéis são sempre pelo painel).
 *
 * Uso (com ANIME_HUB_DATABASE_URL apontando para o banco):
 *   node scripts/criar-primeiro-admin.mjs --email voce@exemplo.com --nome "Seu Nome"
 *
 * A conta nasce com uma senha provisória, mostrada uma única vez aqui; no primeiro login a pessoa escolhe a dela.
 * O cálculo da senha é o mesmo de src/lib/auth/password.ts (scrypt, 64 bytes, sal de 16 bytes em hex).
 */
import { randomBytes, randomInt, scrypt } from "node:crypto";
import { promisify } from "node:util";
import prismaPkg from "@prisma/client";

const { PrismaClient } = prismaPkg;
const scryptAsync = promisify(scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "").trim() : "";
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const email = arg("email").toLowerCase();
const displayName = arg("nome");
if (!process.env.ANIME_HUB_DATABASE_URL) fail("Defina ANIME_HUB_DATABASE_URL (o mesmo endereço do banco que o site usa).");
if (!EMAIL_PATTERN.test(email) || email.length > 254) fail('Informe um e-mail válido: --email voce@exemplo.com');
if (!displayName || displayName.length > 60) fail('Informe o nome (até 60 caracteres): --nome "Seu Nome"');

const prisma = new PrismaClient();
try {
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins > 0) fail(`Este banco já tem ${admins} administrador(es). Crie contas e dê papéis em Admin → Acesso e moderação.`);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) fail("Já existe uma conta com esse e-mail.");

  let temporaryPassword = "";
  for (let i = 0; i < 12; i += 1) temporaryPassword += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(temporaryPassword, salt, 64)).toString("hex");

  const user = await prisma.user.create({
    data: { email, displayName, passwordHash: hash, passwordSalt: salt, role: "ADMIN", mustChangePassword: true },
    select: { id: true, email: true },
  });
  await prisma.adminLog.create({ data: { level: "WARN", event: "First admin created", message: `Primeiro administrador criado pela linha de comando: ${user.email}.`, context: `user:${user.id}` } });

  console.log("\n✓ Primeiro administrador criado.");
  console.log(`  E-mail:            ${user.email}`);
  console.log(`  Senha provisória:  ${temporaryPassword}`);
  console.log("  Ela aparece só agora. No primeiro login o site pede uma senha nova.\n");
} finally {
  await prisma.$disconnect();
}
