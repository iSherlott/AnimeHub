import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedAiringSchedule } from "@/lib/airingCache";
import { calendarItemFromCache } from "@/lib/calendarItem";
import { getCurrentUser } from "@/lib/auth/session";
import { startOfWeekMonday } from "@/lib/calendarWeek";

const MAX_WEEK_OFFSET = 8;

const WEEK_SECONDS = 7 * 24 * 3600;

/** Fallback só usado quando `weekStart` não vem na query (ex.: chamada direta
 * à API) — nesse caso não há como saber o fuso do cliente, então caímos no
 * relógio do servidor mesmo. */
function serverWeekStart(weekOffset: number): number {
  return Math.floor(startOfWeekMonday(new Date(), weekOffset).getTime() / 1000);
}

/**
 * Calendário de lançamentos (equivalente ao simulcast calendar). Só lê do
 * banco (AiringScheduleEntry) — quem busca na AniList e mantém o cache
 * quente é o serviço separado `services/calendar-loader` (roda a cada 30min,
 * ver docker-compose.yml). Rodando só `npm run dev` sem esse serviço em pé
 * (`docker compose up -d calendar-loader`), o calendário fica vazio até a
 * primeira rodada dele.
 *
 * `weekOffset` desloca a semana fixa exibida (0 = semana atual, 1 = próxima
 * semana, -1 = semana anterior), limitado a +-8 semanas para evitar
 * varreduras enormes na AniList.
 *
 * `weekStart` é o timestamp Unix (segundos) do segunda 00:00 **no fuso do
 * navegador**, calculado pelo front-end (buildWeekDays em
 * src/app/calendar/page.tsx) e sempre preferido em vez de recalcular "hoje"
 * no servidor — server e navegador podem estar em fusos diferentes, e cada
 * um tendo sua própria ideia de "qual semana é a atual" foi exatamente o bug
 * já visto uma vez aqui (o grid mostrava uma semana enquanto os dados
 * buscados eram de outra). Ainda assim é limitado a +-(MAX_WEEK_OFFSET+1)
 * semanas do relógio do servidor, só como cinto de segurança contra abuso.
 */
export async function GET(request: NextRequest) {
  const weekOffsetParam = Number(request.nextUrl.searchParams.get("weekOffset") ?? "0");
  const weekOffset = Number.isFinite(weekOffsetParam)
    ? Math.max(-MAX_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, Math.trunc(weekOffsetParam)))
    : 0;

  const weekStartRaw = request.nextUrl.searchParams.get("weekStart");
  const weekStartParam = weekStartRaw !== null ? Number(weekStartRaw) : NaN;
  const serverNow = Math.floor(Date.now() / 1000);
  // Margem folgada (duas semanas além do +-8 de weekOffset) — o cinto de
  // segurança é só contra abuso, não deve rejeitar um weekStart legítimo por
  // causa de fuso horário do cliente + latência da requisição.
  const safetyMargin = (MAX_WEEK_OFFSET + 2) * WEEK_SECONDS;
  const usingClientWeekStart =
    Number.isFinite(weekStartParam) && Math.abs(weekStartParam - serverNow) <= safetyMargin;
  const weekStart = usingClientWeekStart ? weekStartParam : serverWeekStart(weekOffset);

  // O caminho com weekStart do cliente já está ancorado no relógio certo,
  // então só precisa de uma margem pequena (arredondamento/DST). O fallback
  // pro relógio do servidor ainda carrega o risco original de discordância
  // de fuso, então usa uma margem maior.
  const BUFFER_SECONDS = usingClientWeekStart ? 3600 : 6 * 3600;
  const from = weekStart - BUFFER_SECONDS;
  const to = weekStart + WEEK_SECONDS + BUFFER_SECONDS;

  const entries = await getCachedAiringSchedule(new Date(from * 1000), new Date(to * 1000));

  // Navegar o calendário nunca exige login — sem sessão, ninguém aparece
  // marcado como "já está na minha lista" (não existe "minha lista" pra
  // mostrar). Escopado aos anilistIds que realmente aparecem nesta semana
  // (não a lista inteira do usuário) — trazer título/sinopse em português
  // pro preview do lote 2 do Epic 27 tornaria essa query pesada demais se
  // buscasse todo mundo da lista a cada carregamento do calendário.
  const user = await getCurrentUser();
  const weekAnilistIds = Array.from(new Set(entries.map((e) => e.anilistId)));
  const myAnime =
    user && weekAnilistIds.length
      ? await prisma.anime.findMany({
          where: { userId: user.id, anilistId: { in: weekAnilistIds } },
          select: { id: true, anilistId: true, titlePortuguese: true, description: true, descriptionPortuguese: true, isFavorite: true },
        })
      : [];
  const myAnimeByAnilistId = new Map(
    myAnime.map((a) => [
      a.anilistId,
      { id: a.id, titlePortuguese: a.titlePortuguese, description: a.description, descriptionPortuguese: a.descriptionPortuguese, isFavorite: a.isFavorite },
    ])
  );

  return NextResponse.json({
    results: entries.map((e) => calendarItemFromCache(e, myAnimeByAnilistId)),
  });
}
