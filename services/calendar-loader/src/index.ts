import { createServer } from "node:http";
import { getAiringSchedule } from "../../../src/lib/anilist";
import { cacheAiringSchedule } from "../../../src/lib/airingCache";

const PORT = Number(process.env.PORT ?? 4001);
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

// Mesma janela que o BFF usava (src/app/api/calendar/route.ts, agora só
// leitura) — cobre tudo que a UI pode pedir via weekOffset (+-8 semanas).
const MAX_WEEK_OFFSET = 8;
const WEEK_SECONDS = 7 * 24 * 3600;

async function refreshOnce(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - MAX_WEEK_OFFSET * WEEK_SECONDS;
  const to = now + (MAX_WEEK_OFFSET + 1) * WEEK_SECONDS;
  try {
    const entries = await getAiringSchedule(from, to);
    await cacheAiringSchedule(entries);
    console.log(`[calendar-loader] refreshed ${entries.length} entries`);
  } catch (error) {
    console.error("[calendar-loader] refresh failed:", error);
  }
}

refreshOnce();
setInterval(refreshOnce, REFRESH_INTERVAL_MS);

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`[calendar-loader] health server listening on :${PORT}`);
});
