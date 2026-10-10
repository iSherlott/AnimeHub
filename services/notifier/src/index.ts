import { createServer } from "node:http";
import { prisma } from "../../../src/lib/prisma";
import { notifyRangeForNow } from "../../../src/lib/airingWindow";
import { recordIngestionRun } from "../../../src/lib/ingestionRuns";
import { RESCHEDULE_THRESHOLD_MS } from "../../../src/lib/rescheduleAlerts";

const PORT = Number(process.env.PORT ?? 4004);
const TICK_INTERVAL_MS = 2 * 60 * 1000;

// A AniList reagenda episódio com frequência — se o horário salvo mudar
// mais que RESCHEDULE_THRESHOLD_MS desde o alerta já criado, trata como um
// adiamento de verdade: desmarca "visto" e guarda o horário anterior para
// a mensagem "Data alterada" (senão um episódio genuinamente atrasado
// ficaria preso como "já visto" por causa do alerta antigo).

const RETENTION_MS = 7 * 24 * 3600 * 1000;

async function tick(): Promise<void> {
  const startedAt = new Date();
  let failed = 0;
  let processedForLog = 0;
  let failureMessage: string | null = null;
  try {
    const now = new Date();
    // Avisa dos lançamentos das próximas 24 h (hoje) e dos que acabaram de ir ao ar.
    const { from, to } = notifyRangeForNow(now);

    const airingNow = await prisma.airingScheduleEntry.findMany({
      where: { airingAt: { gte: from, lte: to } },
      select: { anilistId: true, episode: true, airingAt: true },
    });

    let processed = 0;

    if (airingNow.length > 0) {
      const anilistIds = [...new Set(airingNow.map((e) => e.anilistId))];
      // Uma consulta só pra achar todo mundo que tem algum desses animes na
      // lista, em vez de perguntar usuário por usuário.
      const matchingAnime = await prisma.anime.findMany({
        // Escopo: toda obra acompanhada, de quem não desligou os avisos de lançamento.
        where: { anilistId: { in: anilistIds }, userId: { not: null }, user: { is: { notifyReleases: true } } },
        select: { userId: true, anilistId: true },
      });

      for (const anime of matchingAnime) {
        const userId = anime.userId as string;
        const entries = airingNow.filter((e) => e.anilistId === anime.anilistId);

        for (const entry of entries) {
          // Um alerta com problema não pode derrubar os demais do tick.
          try {
            const key = { userId, anilistId: entry.anilistId, episode: entry.episode };
            const existing = await prisma.airingAlert.findUnique({ where: { userId_anilistId_episode: key } });

            const rescheduled =
              existing != null &&
              Math.abs(existing.airingAt.getTime() - entry.airingAt.getTime()) > RESCHEDULE_THRESHOLD_MS;

            // upsert atômico: dois ticks/instâncias não colidem na chave única.
            await prisma.airingAlert.upsert({
              where: { userId_anilistId_episode: key },
              create: { ...key, airingAt: entry.airingAt },
              update: {
                airingAt: entry.airingAt,
                ...(rescheduled && existing ? { seenAt: null, previousAiringAt: existing.airingAt } : {}),
              },
            });
            processed++;
          } catch (error) {
            failed++;
            failureMessage = error instanceof Error ? error.message : String(error);
            console.error("[notifier] alerta falhou:", error);
          }
        }
      }
    }

    const retentionCutoff = new Date(Date.now() - RETENTION_MS);
    const purged = await prisma.airingAlert.deleteMany({
      where: { createdAt: { lt: retentionCutoff } },
    });

    processedForLog = processed;
    console.log(
      `[notifier] tick: ${processed} alertas processados, ${purged.count} antigos removidos`
    );
  } catch (error) {
    failed++;
    failureMessage = error instanceof Error ? error.message : String(error);
    console.error("[notifier] tick falhou:", error);
  }
  // Só registra ticks com algo a dizer (alertas processados ou falha): um
  // registro a cada 2 min sem novidade só poluiria o painel.
  if (processedForLog > 0 || failed > 0) {
    await recordIngestionRun({ source: "notifier", startedAt, processed: processedForLog, failed, message: failureMessage });
  }
}

tick();
setInterval(tick, TICK_INTERVAL_MS);

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, () => {
  console.log(`[notifier] health server listening on :${PORT}`);
});
