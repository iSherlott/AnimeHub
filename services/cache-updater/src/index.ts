import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { searchAnimeCatalog } from "../../../src/lib/searchAnimeCatalog";
import { getSeasonalCatalog, type Season } from "../../../src/lib/seasonalCatalog";

const PORT = Number(process.env.PORT ?? 4003);

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

async function handleSearch(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Corpo inválido" });
    return;
  }

  if (typeof body.query !== "string" || !body.query.trim()) {
    sendJson(res, 400, { error: "query é obrigatório" });
    return;
  }

  try {
    const result = await searchAnimeCatalog(body.query);
    sendJson(res, 200, result);
  } catch (error) {
    console.error("[cache-updater] search falhou:", error);
    sendJson(res, 502, { error: "Falha ao buscar na AniList" });
  }
}

async function handleSeason(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Corpo inválido" });
    return;
  }

  const season = typeof body.season === "string" ? (body.season as Season) : null;
  const seasonYear = typeof body.seasonYear === "number" ? body.seasonYear : null;

  try {
    const result = await getSeasonalCatalog(season, seasonYear);
    sendJson(res, 200, result);
  } catch (error) {
    console.error("[cache-updater] season falhou:", error);
    sendJson(res, 502, { error: "Falha ao buscar lançamentos da temporada" });
  }
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  if (req.method === "POST" && req.url === "/search") {
    void handleSearch(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/season") {
    void handleSeason(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`[cache-updater] listening on :${PORT}`);
});
