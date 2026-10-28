#!/usr/bin/env node
/**
 * Nome de usuário (@) para as contas antigas que ainda não têm. Desde 28/10 o @ é fixo e só o administrador o define;
 * este comando poupa definir um por um no painel (Admin → Acesso e moderação → Usuários → "definir").
 *
 * Uso (com ANIME_HUB_DATABASE_URL apontando para o banco):
 *   node scripts/sugerir-usuarios.mjs                       só mostra as contas sem @ e a sugestão de cada uma
 *   node scripts/sugerir-usuarios.mjs --aplicar             grava as sugestões
 *   node scripts/sugerir-usuarios.mjs --definir voce@exemplo.com=seu_usuario [--definir …] [--aplicar]
 *                                                           troca a sugestão de uma conta pelo @ escolhido
 *
 * Sem --aplicar nada é gravado. Só mexe em conta que ainda não tem @ (nunca troca um @ existente) e cada gravação fica
 * no log do painel ("Handle set"). Sugestão: o nome em minúsculas, sem acento, com _ no lugar de espaço
 * ("Sherlott Silva" → sherlott_silva); repetido ganha _2, _3…
 */
import prismaPkg from "@prisma/client";
import { handleProblem, suggestHandle } from "./sugestao-de-usuario.mjs";

const { PrismaClient, Prisma } = prismaPkg;

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const apply = process.argv.includes("--aplicar");
const chosen = new Map();
for (let i = 0; i < process.argv.length; i += 1) {
  if (process.argv[i] !== "--definir") continue;
  const [email, handle] = String(process.argv[i + 1] ?? "").split("=");
  if (!email || !handle) fail("Use --definir email=usuario (ex.: --definir voce@exemplo.com=seu_usuario).");
  chosen.set(email.trim().toLowerCase(), handle.trim().replace(/^@/, ""));
}
if (!process.env.ANIME_HUB_DATABASE_URL) fail("Defina ANIME_HUB_DATABASE_URL (o mesmo endereço do banco que o site usa).");

const prisma = new PrismaClient();
try {
  const [pending, withHandle] = await Promise.all([
    prisma.user.findMany({ where: { handle: null }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, displayName: true } }),
    prisma.user.findMany({ where: { handle: { not: null } }, select: { handle: true } }),
  ]);
  if (pending.length === 0) {
    console.log("\n✓ Todas as contas já têm nome de usuário.\n");
    process.exit(0);
  }
  for (const email of chosen.keys()) if (!pending.some((u) => u.email === email)) fail(`${email}: não há conta sem @ com esse e-mail.`);

  // Os escolhidos à mão entram primeiro, para as sugestões desviarem deles.
  const taken = new Set(withHandle.map((u) => u.handle));
  const plan = new Map();
  for (const u of pending) {
    const handle = chosen.get(u.email);
    if (!handle) continue;
    const problem = handleProblem(handle, taken);
    if (problem) fail(`${u.email}: @${handle} ${problem}.`);
    taken.add(handle);
    plan.set(u.id, { handle, how: "escolhido" });
  }
  for (const u of pending) {
    if (plan.has(u.id)) continue;
    const handle = suggestHandle(u.displayName, u.email, taken);
    taken.add(handle);
    plan.set(u.id, { handle, how: "sugerido" });
  }

  console.log(`\n${pending.length} ${pending.length === 1 ? "conta sem nome de usuário" : "contas sem nome de usuário"}:\n`);
  console.table(pending.map((u) => ({ "e-mail": u.email, nome: u.displayName, "@": `@${plan.get(u.id).handle}`, origem: plan.get(u.id).how })));

  if (!apply) {
    console.log("Nada foi gravado. Para gravar: o mesmo comando com --aplicar (e --definir email=usuario para trocar alguma).\n");
    process.exit(0);
  }

  let saved = 0;
  for (const u of pending) {
    const { handle } = plan.get(u.id);
    try {
      // `handle: null` no filtro: se alguém definiu o @ pelo painel enquanto isto rodava, não sobrescreve.
      const { count } = await prisma.user.updateMany({ where: { id: u.id, handle: null }, data: { handle } });
      if (count === 0) {
        console.log(`  - ${u.email}: já ganhou um @ no painel; ficou como está.`);
        continue;
      }
      await prisma.adminLog.create({ data: { level: "INFO", event: "Handle set", message: `Nome de usuário de ${u.displayName} definido pelo comando sugerir-usuarios: @${handle}.`, context: `user:${u.id}` } });
      saved += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        console.log(`  - ${u.email}: @${handle} acabou de ser usado por outra conta; rode o comando de novo.`);
        continue;
      }
      throw error;
    }
  }
  console.log(`\n✓ ${saved} ${saved === 1 ? "nome de usuário gravado" : "nomes de usuário gravados"}.\n`);
} finally {
  await prisma.$disconnect();
}
