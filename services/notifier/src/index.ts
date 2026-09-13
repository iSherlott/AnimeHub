import { createServer } from "node:http";
import { prisma } from "../../../src/lib/prisma";

const PORT = Number(process.env.PORT ?? 4004);
const TICK_INTERVAL_MS = 2 * 60 * 1000;

// Janela de "no ar agora": um pouco antes (episódio recém-começou) até bem
// depois (dá tempo da pessoa ver o alerta mesmo sem estar olhando no
// instante exato) do horário de exibição confirmado pela AniList.
const AIRING_WINDOW_BEFORE_MS = 5 * 60 * 1000;
const AIRING_WINDOW_AFTER_MS = 30 * 60 * 1000;

// A AniList reagenda episódio com frequência — se o horário salvo mudar
// mais que isso desde o alerta já criado, trata como um adiamento de
// verdade e desmarca "visto" (senão um episódio genuinamente atrasado
// ficaria preso como "já visto" por causa do alerta antigo).
const RESCHEDULE_THRESHOLD_MS = 10 * 60 * 1000;

const RETENTION_MS = 7 * 24 * 3600 * 1000;

async function tick(): Promise<void> {
  try {
    const now = new Date();
    const from = new Date(now.getTime() - AIRING_WINDOW_BEFORE_MS);
    const to = new Date(now.getTime() + AIRING_WINDOW_AFTER_MS);

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
        where: { anilistId: { in: anilistIds }, userId: { not: null } },
        select: { userId: true, anilistId: true },
      });

      for (const anime of matchingAnime) {
        const userId = anime.userId as string;
        const entries = airingNow.filter((e) => e.anilistId === anime.anilistId);

        for (const entry of entries) {
          const existing = await prisma.airingAlert.findUnique({
            where: {
              userId_anilistId_episode: {
                userId,
                anilistId: entry.anilistId,
                episode: entry.episode,
              },
            },
          });

          const rescheduled =
            existing != null &&
            Math.abs(existing.airingAt.getTime() - entry.airingAt.getTime()) > RESCHEDULE_THRESHOLD_MS;

          if (existing) {
            await prisma.airingAlert.update({
              where: { id: existing.id },
              data: {
                airingAt: entry.airingAt,
                ...(rescheduled ? { seenAt: null } : {}),
              },
            });
          } else {
            await prisma.airingAlert.create({
              data: {
                userId,
                anilistId: entry.anilistId,
                episode: entry.episode,
                airingAt: entry.airingAt,
              },
            });
          }
          processed++;
        }
      }
    }

    const retentionCutoff = new Date(Date.now() - RETENTION_MS);
    const purged = await prisma.airingAlert.deleteMany({
      where: { createdAt: { lt: retentionCutoff } },
    });

    console.log(
      `[notifier] tick: ${processed} alertas processados, ${purged.count} antigos removidos`
    );
  } catch (error) {
    console.error("[notifier] tick falhou:", error);
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
