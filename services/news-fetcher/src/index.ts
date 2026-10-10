import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { prisma } from "../../../src/lib/prisma";
import { isNewsRunning, isScheduledNewsDue, runNewsSync } from "../../../src/lib/animeNews";

const PORT = Number(process.env.PORT ?? 4005);

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Corpo da requisição não é JSON válido"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Chamado pelo painel (Admin → Scrapers → "Buscar notícias"): responde já e segue em segundo plano. */
async function handleRun(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown> = {};
  try {
    body = await readJsonBody(req);
  } catch {
    // Corpo opcional: sem JSON válido, segue como execução manual anônima.
  }
  try {
    if (await isNewsRunning()) {
      sendJson(res, 409, { error: "Já existe uma execução em andamento." });
      return;
    }
    // Uma chamada por obra da temporada (≈1 s cada): não dá para esperar na requisição.
    void runNewsSync({ trigger: "manual", adminName: typeof body.adminName === "string" ? body.adminName : null });
    sendJson(res, 202, { started: true });
  } catch (error) {
    console.error("[news-fetcher] run falhou:", error);
    sendJson(res, 500, { error: "Falha ao iniciar a busca de notícias" });
  }
}

/** Uma busca por dia (a partir das 00:00 de America/Sao_Paulo); um serviço reiniciado recupera o dia perdido. */
async function tickSchedule() {
  try {
    const last = await prisma.newsRun.findFirst({ where: { adminName: null, status: { not: "RUNNING" } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
    if (isScheduledNewsDue(new Date(), last?.startedAt ?? null)) {
      console.log("[news-fetcher] iniciando busca diária de notícias");
      await runNewsSync({ trigger: "schedule" });
    }
  } catch (error) {
    console.error("[news-fetcher] agendador falhou:", error);
  }
}
if (process.env.NEWS_SCHEDULE !== "off") {
  setTimeout(() => void tickSchedule(), 60_000);
  setInterval(() => void tickSchedule(), 30 * 60_000);
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  if (req.method === "POST" && req.url === "/run") {
    void handleRun(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`[news-fetcher] listening on :${PORT}`);
});
