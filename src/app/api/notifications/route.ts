import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

/**
 * Lista os alertas de "favorito no ar agora" (Epic 10) — só leitura, quem
 * escreve é o services/notifier a cada ~2min. `airingAt`/`seenAt` vão como
 * ISO/epoch crus, sem formatação de "faltam X minutos" no servidor — o
 * cliente calcula com o próprio relógio, mesmo princípio já usado no
 * calendário (evita divergência de fuso servidor/navegador).
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const alerts = await prisma.airingAlert.findMany({
    where: { userId: user.id },
    orderBy: { airingAt: "desc" },
  });

  const anilistIds = [...new Set(alerts.map((a) => a.anilistId))];
  const animeByAnilistId = new Map(
    (
      await prisma.anime.findMany({
        where: { userId: user.id, anilistId: { in: anilistIds } },
        select: { id: true, anilistId: true, titleRomaji: true, coverImage: true },
      })
    ).map((a) => [a.anilistId, a])
  );

  const results = alerts.map((alert) => {
    const anime = animeByAnilistId.get(alert.anilistId);
    return {
      id: alert.id,
      anilistId: alert.anilistId,
      episode: alert.episode,
      airingAt: alert.airingAt.toISOString(),
      seenAt: alert.seenAt ? alert.seenAt.toISOString() : null,
      animeId: anime?.id ?? null,
      titleRomaji: anime?.titleRomaji ?? null,
      coverImage: anime?.coverImage ?? null,
    };
  });

  return NextResponse.json({
    alerts: results,
    unseenCount: results.filter((r) => !r.seenAt).length,
  });
}
