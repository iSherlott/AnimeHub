import { ChildProcess, execSync, spawn } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ANIME_FIXTURES, UTILITY_FIXTURE } from "./fixtures/animes";
import { TEST_DB_URL } from "./test-db";
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_SESSION_TOKEN,
  TEST_SESSION_TOKEN,
  TEST_USER_EMAIL,
} from "./test-auth";

const ROOT = path.join(__dirname, "..");
export const TEST_SERVER_PORT = 3100;

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Servidor de teste não respondeu em ${url}`));
          } else {
            setTimeout(tryOnce, 300);
          }
        });
    };
    tryOnce();
  });
}

export default async function globalSetup() {
  // Postgres persiste entre rodadas (ao contrário do arquivo .db do SQLite,
  // que era simplesmente apagado antes de cada `npm test`). Recria o schema
  // do zero — em vez de só truncar as tabelas — pra manter a mesma garantia
  // de antes: TODAS as migrations são reaplicadas do zero a cada rodada, sem
  // depender do histórico de `_prisma_migrations` já gravado no banco (que
  // um `migrate deploy` simples nunca corrigiria se divergisse). Fica restrito
  // ao banco `animehub_test` (nunca `animehub`, o de dev) via TEST_DB_URL.
  const resetClient = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  await resetClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE;`);
  await resetClient.$executeRawUnsafe(`CREATE SCHEMA public;`);
  await resetClient.$disconnect();

  execSync("npx prisma migrate deploy", {
    cwd: ROOT,
    env: { ...process.env, ANIME_HUB_DATABASE_URL: TEST_DB_URL },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  try {
    // Usuário + sessão fixos, injetados direto no banco (sem passar pelo
    // hashing real de senha, que não importa aqui — nenhum teste faz login
    // de verdade, só reaproveita esse token via storageState do Playwright).
    const user = await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Test User",
      },
    });
    await prisma.session.create({
      data: {
        token: TEST_SESSION_TOKEN,
        userId: user.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });

    const admin = await prisma.user.create({
      data: {
        email: TEST_ADMIN_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Admin",
        role: "ADMIN",
      },
    });
    await prisma.session.create({
      data: {
        token: TEST_ADMIN_SESSION_TOKEN,
        userId: admin.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });

    for (const fixture of [...ANIME_FIXTURES, UTILITY_FIXTURE]) {
      await prisma.anime.create({
        data: {
          userId: user.id,
          anilistId: fixture.anilistId,
          titleRomaji: fixture.titleRomaji,
          genres: "",
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  const nextBin = path.join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next"
  );
  // Rate limit desligado na suíte E2E (muitos logins/cadastros do mesmo IP); coberto por unit tests.
  const testEnv = { ...process.env, ANIME_HUB_DATABASE_URL: TEST_DB_URL, ANIME_HUB_RATE_LIMIT_DISABLED: "1", EPISODE_IMAGES_KITSU_BASE_URL: "http://localhost:3199/api/edge", IMPORT_PREFETCH_SEASON: "false", NEWS_REQUEST_GAP_MS: "0", MYMEMORY_URL: "http://localhost:3198/mymemory", JIKAN_API_BASE_URL: "http://localhost:3198/v4", NEWS_FEED_URL: "http://localhost:3198/feed.xml" };

  // build de produção: mais rápido e determinístico que `next dev` (sem
  // compilação sob demanda do Turbopack, que causava flakiness na 1ª visita
  // de cada rota).
  execSync(`"${nextBin}" build`, {
    cwd: ROOT,
    env: testEnv,
    stdio: "inherit",
  });

  const server: ChildProcess = spawn(
    nextBin,
    ["start", "--port", String(TEST_SERVER_PORT)],
    {
      cwd: ROOT,
      env: testEnv,
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32",
    }
  );

  await waitForServer(`http://localhost:${TEST_SERVER_PORT}`, 60_000);

  return async () => {
    if (!server.pid) return;
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: "ignore" });
      } catch {
        // já pode ter encerrado
      }
    } else {
      server.kill();
    }
  };
}
