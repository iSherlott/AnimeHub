import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { deriveSeriesInfo } from "../../../src/lib/series";
import { toFuriganaHtml } from "../../../src/lib/furigana";
import {
  mergeGenres,
  pickAnidbTitles,
  dedupeByNormalizedTitle,
  type AnidbTitleCandidate,
  type DedupeCandidate,
} from "./identity";

const PORT = Number(process.env.PORT ?? 4002);

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

/**
 * Consolida em uma chamada só a lógica de identidade hoje espalhada em 4
 * lugares do BFF: deriveSeriesInfo (série/temporada a partir do título),
 * fusão de gêneros de múltiplas fontes, escolha de título da AniDB por
 * idioma, e deduplicação de catálogo por título normalizado. Cada peça só é
 * calculada se o campo de entrada correspondente vier no corpo.
 */
async function handleResolveIdentity(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Corpo inválido" });
    return;
  }

  const result: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) {
    Object.assign(result, deriveSeriesInfo(body.title));
  }

  if (Array.isArray(body.existingGenres) && Array.isArray(body.sourceGenres)) {
    result.mergedGenres = mergeGenres(
      body.existingGenres as string[],
      body.sourceGenres as string[][]
    );
  }

  if (Array.isArray(body.anidbTitles)) {
    result.anidbTitle = pickAnidbTitles(body.anidbTitles as AnidbTitleCandidate[]);
  }

  if (Array.isArray(body.dedupeCandidates)) {
    result.keptKeys = dedupeByNormalizedTitle(body.dedupeCandidates as DedupeCandidate[]);
  }

  // Nenhum dos 4 campos reconhecidos veio (nome errado, tipo errado, corpo
  // vazio) — melhor recusar explicitamente do que devolver 200 {} sem sinal
  // nenhum de que a chamada não fez nada.
  if (Object.keys(result).length === 0) {
    sendJson(res, 400, {
      error:
        "Nenhum campo reconhecido no corpo — esperado ao menos um de: title, " +
        "existingGenres+sourceGenres, anidbTitles, dedupeCandidates",
    });
    return;
  }

  sendJson(res, 200, result);
}

async function handleFurigana(req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Corpo inválido" });
    return;
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    sendJson(res, 400, { error: "text é obrigatório" });
    return;
  }

  try {
    const html = await toFuriganaHtml(body.text);
    sendJson(res, 200, { html });
  } catch (error) {
    console.error("[name-resolver] furigana falhou:", error);
    sendJson(res, 500, { error: "Falha ao gerar furigana" });
  }
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  if (req.method === "POST" && req.url === "/resolve-identity") {
    void handleResolveIdentity(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/furigana") {
    void handleFurigana(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`[name-resolver] listening on :${PORT}`);
});
