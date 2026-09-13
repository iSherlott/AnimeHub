import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { prisma } from "../../../src/lib/prisma";
import { searchAnimeCatalog } from "../../../src/lib/searchAnimeCatalog";
import { getSeasonalCatalog, type Season } from "../../../src/lib/seasonalCatalog";
import { resolveAnimeMedia } from "../../../src/lib/resolveAnimeMedia";
import { ensureEpisodes } from "../../../src/lib/episodes";
import { refreshAnimeData } from "../../../src/lib/refreshAnimeData";

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

async function handleResolveAnime(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Corpo inválido" });
    return;
  }

  const anilistId = Number(body.anilistId);
  if (!anilistId) {
    sendJson(res, 400, { error: "anilistId é obrigatório" });
    return;
  }

  try {
    const media = await resolveAnimeMedia(anilistId);
    sendJson(res, 200, media);
  } catch (error) {
    console.error("[cache-updater] resolve-anime falhou:", error);
    sendJson(res, 502, { error: "Falha ao buscar dados do anime" });
  }
}

async function handleEnsureEpisodes(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Corpo inválido" });
    return;
  }

  const animeId = typeof body.animeId === "string" ? body.animeId : null;
  if (!animeId) {
    sendJson(res, 400, { error: "animeId é obrigatório" });
    return;
  }

  // ensureEpisodes só protege sua própria busca na Kitsu — a leitura de
  // cache que ela faz antes disso (e o findUnique abaixo) não são
  // garantidos contra erro de banco; sem este try/catch, uma falha aqui
  // rejeitaria a Promise dentro do `void handleEnsureEpisodes(...)` do
  // listener e derrubaria o processo inteiro (sem handler global de
  // unhandledRejection), tirando do ar os outros 3 endpoints também.
  try {
    const anime = await prisma.anime.findUnique({ where: { id: animeId } });
    if (!anime) {
      sendJson(res, 404, { error: "Anime não encontrado" });
      return;
    }
    const result = await ensureEpisodes(anime);
    sendJson(res, 200, result);
  } catch (error) {
    console.error("[cache-updater] ensure-episodes falhou:", error);
    sendJson(res, 502, { error: "Falha ao garantir episódios" });
  }
}

async function handleRefreshAnime(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Corpo inválido" });
    return;
  }

  const animeId = typeof body.animeId === "string" ? body.animeId : null;
  if (!animeId) {
    sendJson(res, 400, { error: "animeId é obrigatório" });
    return;
  }

  try {
    const anime = await prisma.anime.findUnique({ where: { id: animeId } });
    if (!anime) {
      sendJson(res, 404, { error: "Anime não encontrado" });
      return;
    }
    const result = await refreshAnimeData(anime);
    sendJson(res, 200, result);
  } catch (error) {
    console.error("[cache-updater] refresh-anime falhou:", error);
    sendJson(res, 502, { error: "Falha ao atualizar dados do anime" });
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
  if (req.method === "POST" && req.url === "/resolve-anime") {
    void handleResolveAnime(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/ensure-episodes") {
    void handleEnsureEpisodes(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/refresh-anime") {
    void handleRefreshAnime(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`[cache-updater] listening on :${PORT}`);
});
