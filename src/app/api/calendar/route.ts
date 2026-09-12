import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAiringSchedule } from "@/lib/anilist";
import { cacheAiringSchedule, getCachedAiringSchedule } from "@/lib/airingCache";
import { calendarItemFromAniList, calendarItemFromCache } from "@/lib/calendarItem";

const MAX_WEEK_OFFSET = 8;

/**
 * Calendário de lançamentos (equivalente ao simulcast calendar), alimentado
 * pela AiringSchedule pública da AniList. Busca ao vivo e cacheia; se a
 * AniList estiver fora do ar, cai pro que já foi salvo localmente.
 *
 * `weekOffset` desloca a janela de 7 dias exibida (0 = semana atual, 1 =
 * próxima semana, -1 = semana anterior), limitado a +-8 semanas para evitar
 * varreduras enormes na AniList.
 */
export async function GET(request: NextRequest) {
  const weekOffsetParam = Number(request.nextUrl.searchParams.get("weekOffset") ?? "0");
  const weekOffset = Number.isFinite(weekOffsetParam)
    ? Math.max(-MAX_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, Math.trunc(weekOffsetParam)))
    : 0;

  const base = Math.floor(Date.now() / 1000) + weekOffset * 7 * 24 * 3600;
  const from = base - 24 * 3600;
  const to = base + 8 * 24 * 3600;

  const myAnime = await prisma.anime.findMany({ select: { id: true, anilistId: true } });
  const myAnimeByAnilistId = new Map(myAnime.map((a) => [a.anilistId, a.id]));

  try {
    const entries = await getAiringSchedule(from, to);
    await cacheAiringSchedule(entries);
    return NextResponse.json({
      results: entries.map((e) => calendarItemFromAniList(e, myAnimeByAnilistId)),
      cached: false,
    });
  } catch (error) {
    console.error(error);
    const cached = await getCachedAiringSchedule(new Date(from * 1000), new Date(to * 1000));
    if (cached.length > 0) {
      return NextResponse.json({
        results: cached.map((e) => calendarItemFromCache(e, myAnimeByAnilistId)),
        cached: true,
      });
    }
    return NextResponse.json(
      { error: "Falha ao buscar o calendário de lançamentos" },
      { status: 502 }
    );
  }
}
