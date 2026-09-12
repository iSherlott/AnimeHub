import { ChildProcess, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ANIME_FIXTURES, UTILITY_FIXTURE } from "./fixtures/animes";
import { TEST_DB_PATH, TEST_DB_URL } from "./test-db";

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
  for (const suffix of ["", "-journal"]) {
    const file = TEST_DB_PATH + suffix;
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  execSync("npx prisma migrate deploy", {
    cwd: ROOT,
    env: { ...process.env, ANIME_HUB_DATABASE_URL: TEST_DB_URL },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  try {
    for (const fixture of [...ANIME_FIXTURES, UTILITY_FIXTURE]) {
      await prisma.anime.create({
        data: {
          anilistId: fixture.anilistId,
          titleRomaji: fixture.titleRomaji,
          genres: "",
          progress: { create: { status: "PLAN_TO_WATCH", episodeProgress: 0 } },
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
  const testEnv = { ...process.env, ANIME_HUB_DATABASE_URL: TEST_DB_URL };

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
