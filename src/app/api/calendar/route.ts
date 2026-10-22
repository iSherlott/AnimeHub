import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedAiringSchedule } from "@/lib/airingCache";
import { calendarItemFromCache } from "@/lib/calendarItem";
import { applyAiringOverrides, loadActiveOverrides } from "@/lib/airingOverrides";
import { animeSeasonOf, civilDay, classifyOffGrid, DELAY_GRACE_MS, isDelayed, type OffGridItem } from "@/lib/calendarOffGrid";
import { getCurrentUser } from "@/lib/auth/session";
import { startOfWeekMonday } from "@/lib/calendarWeek";
import { pendingFromMap } from "@/lib/pending";
import { hiddenAnilistIds } from "@/lib/platform";
import { hasBlockedGenre } from "@/lib/contentPolicy";

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

  const cached = await getCachedAiringSchedule(new Date(from * 1000), new Date(to * 1000));
  // Horário efetivo: overrides manuais ativos (Admin → Overrides) valem sobre o da fonte.
  // Só obras da plataforma (trazidas pelo admin) e nunca conteúdo adulto — o cache pode guardar mais do que isso.
  const hiddenIds = await hiddenAnilistIds();
  const visible = cached.filter((e) => !hiddenIds.has(e.anilistId) && !hasBlockedGenre(e.genres));
  const entries = applyAiringOverrides(visible, await loadActiveOverrides(Array.from(new Set(visible.map((e) => e.anilistId)))));

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
          select: { id: true, anilistId: true, titlePortuguese: true, description: true, descriptionPortuguese: true, isFavorite: true, waiting: true },
        })
      : [];
  const myAnimeByAnilistId = new Map(
    myAnime.map((a) => [
      a.anilistId,
      { id: a.id, titlePortuguese: a.titlePortuguese, description: a.description, descriptionPortuguese: a.descriptionPortuguese, isFavorite: a.isFavorite, waiting: a.waiting },
    ])
  );

  // Sinopse já traduzida (português/japonês) guardada no catálogo: o preview nasce no idioma certo.
  const storedRows = weekAnilistIds.length
    ? await prisma.catalogEntry.findMany({ where: { anilistId: { in: weekAnilistIds }, OR: [{ descriptionPt: { not: null } }, { descriptionJa: { not: null } }] }, select: { anilistId: true, descriptionPt: true, descriptionJa: true } })
    : [];
  const storedByAnilistId = new Map(storedRows.map((r) => [r.anilistId as number, { pt: r.descriptionPt, ja: r.descriptionJa }]));

  // "Adiado": em que episódio a pessoa parou, por obra da semana (só quem está logado).
  const pendingByAnilistId = user && myAnime.length ? await pendingFromMap(user.id, myAnime.map((a) => a.anilistId)) : new Map<number, number>();

  // Miniatura do episódio: só obras da lista têm episódios carregados (Episode.thumbnail).
  const ownedIdToAnilist = new Map(myAnime.map((a) => [a.id, a.anilistId]));
  const weekEpisodes = Array.from(new Set(entries.map((e) => e.episode)));
  const thumbnails = ownedIdToAnilist.size
    ? await prisma.episode.findMany({
        where: { animeId: { in: Array.from(ownedIdToAnilist.keys()) }, thumbnail: { not: null }, number: { in: weekEpisodes } },
        select: { animeId: true, number: true, thumbnail: true },
        orderBy: { seasonNumber: "desc" },
      })
    : [];
  const episodeImages = new Map<string, string>();
  for (const t of thumbnails) {
    const key = `${ownedIdToAnilist.get(t.animeId)}-${t.number}`;
    if (t.thumbnail && !episodeImages.has(key)) episodeImages.set(key, t.thumbnail);
  }
  // Imagens de qualquer anime do calendário (job diário das 00:00); a miniatura da própria lista tem prioridade.
  const cachedImages = weekAnilistIds.length
    ? await prisma.episodeImage.findMany({ where: { anilistId: { in: weekAnilistIds }, episode: { in: weekEpisodes } }, select: { anilistId: true, episode: true, thumbnail: true } })
    : [];
  for (const img of cachedImages) {
    const key = `${img.anilistId}-${img.episode}`;
    if (!episodeImages.has(key)) episodeImages.set(key, img.thumbnail);
  }

  // "Atrasado": só vale checar quem já passou da tolerância — uma busca curta no catálogo.
  const now = new Date();
  const pastIds = Array.from(
    new Set(entries.filter((e) => e.airingAt.getTime() <= now.getTime() - DELAY_GRACE_MS).map((e) => e.anilistId))
  );
  const catalogNext = pastIds.length
    ? await prisma.catalogEntry.findMany({
        where: { anilistId: { in: pastIds } },
        select: { anilistId: true, nextEpisodeNumber: true, nextEpisodeAt: true },
      })
    : [];
  const catalogNextById = new Map(catalogNext.map((c) => [c.anilistId as number, c]));

  // Fora da grade (D-25): nunca ganham posição inventada. Só estreias com dia
  // exato perto desta semana ("dated"), e — da temporada da semana — o que não
  // tem data confiável ("undated") ou está em hiato ("postponed").
  const weekMid = new Date((weekStart + WEEK_SECONDS / 2) * 1000);
  const { season, year } = animeSeasonOf(weekMid);
  const offGridRows = await prisma.catalogEntry.findMany({
    where: {
      anilistId: { not: null, notIn: weekAnilistIds },
      onPlatform: true,
      status: { in: ["NOT_YET_RELEASED", "HIATUS"] },
      OR: [
        { season, seasonYear: year },
        { startDate: { gte: new Date((weekStart - 86400) * 1000), lt: new Date((weekStart + WEEK_SECONDS + 86400) * 1000) } },
      ],
    },
    orderBy: [{ popularityRank: "asc" }, { titleRomaji: "asc" }],
    take: 60,
  });
  const offGridIds = offGridRows.map((r) => r.anilistId as number);
  const ownedOffGrid =
    user && offGridIds.length
      ? await prisma.anime.findMany({ where: { userId: user.id, anilistId: { in: offGridIds } }, select: { anilistId: true } })
      : [];
  const ownedOffGridIds = new Set(ownedOffGrid.map((a) => a.anilistId));
  let undatedBudget = 6;
  const offGrid: OffGridItem[] = [];
  for (const row of offGridRows) {
    const kind = classifyOffGrid(row);
    if (!kind) continue;
    if (kind !== "dated") {
      if (undatedBudget === 0) continue;
      undatedBudget -= 1;
    }
    offGrid.push({
      key: `offgrid-${row.anilistId}`,
      anilistId: row.anilistId as number,
      titleRomaji: row.titleRomaji,
      titleEnglish: row.titleEnglish,
      titleNative: row.titleNative,
      kind,
      startDate: kind === "dated" && row.startDate ? civilDay(row.startDate) : null,
      episode: kind === "dated" ? row.nextEpisodeNumber : null,
      inMyList: ownedOffGridIds.has(row.anilistId as number),
    });
  }

  return NextResponse.json({
    results: entries.map((e) =>
      calendarItemFromCache(
        e,
        myAnimeByAnilistId,
        isDelayed(e.airingAt, e.episode, catalogNextById.get(e.anilistId), now),
        episodeImages.get(`${e.anilistId}-${e.episode}`) ?? null,
        pendingByAnilistId.get(e.anilistId) ?? null,
        storedByAnilistId.get(e.anilistId) ?? null
      )
    ),
    offGrid,
  });
}
