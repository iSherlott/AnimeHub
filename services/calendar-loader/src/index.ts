import { createServer } from "node:http";
import { getAiringScheduleWindow } from "../../../src/lib/anilist";
import { cacheAiringSchedule, pruneMissingFutureEntries } from "../../../src/lib/airingCache";
import { recordIngestionRun } from "../../../src/lib/ingestionRuns";
import {
  buildWeekSlices,
  evaluateLoaderHealth,
  type LoaderState,
} from "../../../src/lib/airingRefresh";

const PORT = Number(process.env.PORT ?? 4001);
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
// Tolera um ciclo perdido + folga antes de o health acusar dado velho.
const MAX_STALE_MS = REFRESH_INTERVAL_MS * 2.5;

// Mesma abrangência que a UI pode pedir via weekOffset (+-8 semanas).
const WEEKS_BACK = 8;
const WEEKS_AHEAD = 8;
// AniList limita ~90 req/min: espaçar as fatias evita rajada (e 429).
const SLICE_PAUSE_MS = 1500;

const state: LoaderState = {
  lastSuccessAt: null,
  firstCycleDone: false,
  upcomingEntries: 0,
  truncatedSlices: 0,
  lastError: null,
};

/**
 * Ingere semana a semana, começando pela semana atual. Antes era uma única
 * janela de ~17 semanas em ordem crescente com teto de 10 páginas: o passado
 * consumia o teto e o presente nunca entrava (calendário vazio, container
 * "healthy"). Agora cada fatia tem sua própria paginação, o truncamento é
 * registrado e o /health reflete o último ciclo.
 */
async function refreshOnce(): Promise<void> {
  const startedAt = new Date();
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  let total = 0;
  let upcoming = 0;
  let truncated = 0;
  let failures = 0;
  let pruned = 0;
  let lastFailure: string | null = null;

  let first = true;
  for (const slice of buildWeekSlices(now, WEEKS_BACK, WEEKS_AHEAD)) {
    if (!first) await new Promise((r) => setTimeout(r, SLICE_PAUSE_MS));
    first = false;
    try {
      // `greater` é exclusivo na AniList: -1 inclui o instante exato do início da fatia.
      const { entries, truncated: wasTruncated } = await getAiringScheduleWindow(slice.from - 1, slice.to);
      await cacheAiringSchedule(entries);
      if (!wasTruncated) {
        pruned += await pruneMissingFutureEntries(entries, new Date(slice.from * 1000), new Date(slice.to * 1000));
      }
      total += entries.length;
      upcoming += entries.filter((e) => e.airingAt >= now).length;
      if (wasTruncated) {
        truncated += 1;
        console.warn(
          `[calendar-loader] fatia ${new Date(slice.from * 1000).toISOString()} truncada pelo teto de paginação`
        );
      }
    } catch (error) {
      failures += 1;
      lastFailure = error instanceof Error ? error.message : String(error);
      console.error("[calendar-loader] fatia falhou:", error);
    }
  }

  state.firstCycleDone = true;
  state.upcomingEntries = upcoming;
  state.truncatedSlices = truncated;
  if (failures === 0) {
    state.lastSuccessAt = nowMs;
    state.lastError = null;
  } else {
    // Ciclo parcial: não conta como sucesso, mas o que entrou ficou salvo.
    state.lastError = lastFailure;
  }
  await recordIngestionRun({
    source: "calendar-loader",
    startedAt,
    processed: total,
    failed: failures,
    message:
      failures > 0
        ? lastFailure
        : truncated > 0
          ? `${truncated} fatia(s) truncada(s) pelo teto de paginação`
          : null,
  });
  console.log(
    `[calendar-loader] refreshed ${total} entries (${upcoming} futuras, ${truncated} fatias truncadas, ${pruned} removidas por sumirem da fonte, ${failures} falhas)`
  );
}

refreshOnce();
setInterval(refreshOnce, REFRESH_INTERVAL_MS);

createServer((req, res) => {
  if (req.url === "/health") {
    const health = evaluateLoaderHealth(state, Date.now(), MAX_STALE_MS);
    res.writeHead(health.ok ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: health.status,
        reasons: health.reasons,
        lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
        upcomingEntries: state.upcomingEntries,
        truncatedSlices: state.truncatedSlices,
      })
    );
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`[calendar-loader] health server listening on :${PORT}`);
});
