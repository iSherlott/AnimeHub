// Sobe os serviços de fundo FORA do Docker (ver docker-compose.yml): `npm run services`.
// Cada serviço roda com `tsx src/index.ts` na própria pasta, lendo o banco de ANIME_HUB_DATABASE_URL do .env da raiz.
// Ctrl+C encerra todos. Uma queda isolada é religada após alguns segundos.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const env = {};
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  } catch {
    /* sem .env: usa só o ambiente do processo */
  }
  return env;
}

const fileEnv = loadEnv(join(root, ".env"));
const SERVICES = [
  { name: "name-resolver", port: 4002 },
  { name: "cache-updater", port: 4003 },
  { name: "calendar-loader", port: 4001 },
  { name: "notifier", port: 4004 },
  { name: "news-fetcher", port: 4005 },
];
const localUrls = { NAME_RESOLVER_URL: "http://localhost:4002", CACHE_UPDATER_URL: "http://localhost:4003", NEWS_FETCHER_URL: "http://localhost:4005" };

const children = new Map();
let stopping = false;

function start(service) {
  const child = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: join(root, "services", service.name),
    env: { ...process.env, ...fileEnv, ...localUrls, PORT: String(service.port) },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  children.set(service.name, child);
  const prefix = `[${service.name}] `;
  const pipe = (stream, target) => stream.on("data", (chunk) => target.write(String(chunk).split(/\r?\n/).filter(Boolean).map((l) => prefix + l).join("\n") + "\n"));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    children.delete(service.name);
    if (stopping) return;
    console.error(`${prefix}saiu (código ${code}); religando em 5s`);
    setTimeout(() => !stopping && start(service), 5000);
  });
}

function stop() {
  stopping = true;
  for (const child of children.values()) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (const service of SERVICES) start(service);
console.log("Serviços iniciados: " + SERVICES.map((s) => `${s.name}:${s.port}`).join(" · "));
