import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveSeriesInfo } from "@/lib/series";
import { hasBlockedGenre } from "@/lib/contentPolicy";
import { platformAnilistIds } from "@/lib/platform";

/**
 * Continuação e retorno de obras. Quando uma obra que a pessoa já acompanhava (e dava como terminada) volta a ter
 * episódios — seja a MESMA entrada que retomou, seja uma nova temporada (continuação) —, ela:
 *   1. volta à lista/calendário (a continuação é acompanhada automaticamente);
 *   2. sai de "Terminei" (o andamento marcado na mão cai e a situação é atualizada);
 *   3. recebe um aviso "voltou a sair episódios" nas notificações.
 * A continuação é achada pela franquia (relações da AniList) e, sem ela, pelo título ("2nd Season", "Season 2", "II"…).
 */
export const RETURN_ALERT_EPISODE = 0;
const RETURNING_STATUSES = ["FINISHED", "HIATUS"] as const;

export type ContinuationSummary = {
  /** Obras que a pessoa já tinha e que voltaram a sair episódios (saíram de "Terminei"). */
  returned: number;
  /** Continuações adicionadas à lista de quem acompanhava a temporada anterior. */
  followed: number;
  /** Avisos "voltou a sair episódios" criados. */
  alerts: number;
  /** Temporadas anteriores acrescentadas à lista de quem acompanha uma temporada mais nova. */
  backfilled: number;
};

type WorkSnapshot = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  genres: string | null;
  seasonNumber: number;
  franchiseId: string | null;
};

/** A obra como a plataforma a conhece: a produção (com franquia) e, na falta dela, o catálogo. */
async function loadWork(anilistId: number): Promise<WorkSnapshot | null> {
  const production = await prisma.production.findUnique({ where: { anilistId } });
  if (production) {
    return {
      anilistId,
      titleRomaji: production.titleRomaji,
      titleEnglish: production.titleEnglish,
      titleNative: production.titleNative,
      coverImage: production.coverImage,
      bannerImage: production.bannerImage,
      description: production.description,
      episodes: production.episodes,
      status: production.status,
      season: production.season,
      seasonYear: production.seasonYear,
      genres: production.genres,
      // O número da franquia vem das relações da AniList; se elas não ligam a sequência (fica 1), vale o do título.
      seasonNumber: Math.max(production.seasonNumber, deriveSeriesInfo(production.titleRomaji).seasonNumber),
      franchiseId: production.franchiseId,
    };
  }
  const entry = await prisma.catalogEntry.findUnique({ where: { anilistId } });
  if (!entry) return null;
  return {
    anilistId,
    titleRomaji: entry.titleRomaji,
    titleEnglish: entry.titleEnglish,
    titleNative: entry.titleNative,
    coverImage: entry.coverImage,
    bannerImage: entry.bannerImage,
    description: entry.description,
    episodes: entry.episodes,
    status: entry.status,
    season: entry.season,
    seasonYear: entry.seasonYear,
    genres: entry.genres,
    seasonNumber: deriveSeriesInfo(entry.titleRomaji).seasonNumber,
    franchiseId: null,
  };
}

/**
 * Os PREQUEL encadeados de uma obra, pelas relações da AniList guardadas na produção (T3 → T2 → T1). Vale mesmo quando a
 * produção da temporada anterior ainda não existe (acontece ao carregar obras antigas depois das novas): a relação da
 * mais nova já diz quem veio antes.
 */
/** Os PREQUEL listados nas relações JSON da produção ([{id, relationType}]); JSON ausente ou inválido = nenhum. */
export function prequelIds(relationsJson: string | null): number[] {
  if (!relationsJson) return [];
  try {
    const parsed = JSON.parse(relationsJson) as Array<{ id?: unknown; relationType?: unknown }>;
    return Array.isArray(parsed) ? parsed.filter((r) => r?.relationType === "PREQUEL" && Number.isInteger(r.id)).map((r) => r.id as number) : [];
  } catch {
    return [];
  }
}

async function prequelChain(anilistId: number): Promise<number[]> {
  const found: number[] = [];
  const seen = new Set<number>([anilistId]);
  let frontier = [anilistId];
  for (let depth = 0; depth < 10 && frontier.length > 0; depth += 1) {
    const productions = await prisma.production.findMany({ where: { anilistId: { in: frontier } }, select: { relationsJson: true } });
    const next: number[] = [];
    for (const p of productions) {
      for (const id of prequelIds(p.relationsJson)) {
        if (seen.has(id)) continue;
        seen.add(id);
        found.push(id);
        next.push(id);
      }
    }
    frontier = next;
  }
  return found;
}

/** Temporadas ANTERIORES de uma obra: as da mesma franquia, as encadeadas por PREQUEL e as de mesmo título-base com número menor. */
export async function earlierSeasonIds(work: Pick<WorkSnapshot, "anilistId" | "titleRomaji" | "seasonNumber" | "franchiseId">): Promise<number[]> {
  const ids = new Set<number>();
  if (work.franchiseId) {
    const siblings = await prisma.production.findMany({
      where: { franchiseId: work.franchiseId, seasonNumber: { lt: work.seasonNumber }, NOT: { anilistId: work.anilistId } },
      select: { anilistId: true },
    });
    for (const s of siblings) ids.add(s.anilistId);
  }
  for (const id of await prequelChain(work.anilistId)) ids.add(id);
  const info = deriveSeriesInfo(work.titleRomaji);
  if (info.seasonNumber > 1) {
    const byTitle = await prisma.anime.findMany({
      where: { seriesKey: info.seriesKey, seasonNumber: { lt: info.seasonNumber }, NOT: { anilistId: work.anilistId } },
      select: { anilistId: true },
      distinct: ["anilistId"],
    });
    for (const a of byTitle) ids.add(a.anilistId);
    // Sem franquia da AniList nem lista de ninguém: o catálogo da plataforma com o mesmo título-base e temporada menor.
    const catalog = await prisma.catalogEntry.findMany({
      where: { anilistId: { not: null }, onPlatform: true, titleRomaji: { contains: info.seriesKey, mode: "insensitive" } },
      select: { anilistId: true, titleRomaji: true },
    });
    for (const c of catalog) {
      const derived = deriveSeriesInfo(c.titleRomaji);
      if (c.anilistId !== work.anilistId && derived.seriesKey === info.seriesKey && derived.seasonNumber < info.seasonNumber) ids.add(c.anilistId as number);
    }
  }
  return Array.from(ids);
}

/** Cria o aviso "voltou a sair episódios" uma única vez por pessoa e obra (um aviso já visto não volta). */
async function recordReturnAlert(userId: string, anilistId: number, firstAt: Date, notify: boolean): Promise<boolean> {
  const key = { userId, anilistId, episode: RETURN_ALERT_EPISODE };
  const existing = await prisma.airingAlert.findUnique({ where: { userId_anilistId_episode: key } });
  if (existing) return false;
  await prisma.airingAlert.create({ data: { ...key, airingAt: firstAt, kind: "RETURN", seenAt: notify ? null : new Date() } });
  return notify;
}

/** Passa a acompanhar a continuação pela pessoa, sem chamar a AniList (usa o que a plataforma já tem). */
async function followContinuation(userId: string, work: WorkSnapshot, seriesKey: string | null): Promise<boolean> {
  if (hasBlockedGenre(work.genres)) return false;
  const info = deriveSeriesInfo(work.titleRomaji);
  try {
    await prisma.anime.create({
      data: {
        userId,
        anilistId: work.anilistId,
        titleRomaji: work.titleRomaji,
        titleEnglish: work.titleEnglish,
        titleNative: work.titleNative,
        coverImage: work.coverImage,
        bannerImage: work.bannerImage,
        description: work.description,
        episodes: work.episodes,
        status: work.status,
        season: work.season,
        seasonYear: work.seasonYear,
        genres: work.genres,
        seriesKey: seriesKey ?? info.seriesKey,
        seasonNumber: work.seasonNumber > 1 ? work.seasonNumber : info.seasonNumber,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false; // já acompanhava
    throw error;
  }
}

/**
 * Quem acompanha a temporada N passa a ter também as anteriores na lista, já como "Terminei" (viu o que veio antes).
 * Só entram as temporadas que a plataforma conhece (produção da franquia ou catálogo na plataforma) e que a pessoa
 * ainda não tem; o que ela já marcou nunca é alterado. Devolve quantas temporadas foram acrescentadas.
 */
export async function ensureEarlierSeasons(userId: string, anilistId: number): Promise<number> {
  const work = await loadWork(anilistId);
  if (!work) return 0;
  const earlier = await earlierSeasonIds(work);
  if (earlier.length === 0) return 0;
  const mine = await prisma.anime.findMany({ where: { userId, anilistId: { in: [anilistId, ...earlier] } }, select: { anilistId: true, seriesKey: true } });
  const have = new Set(mine.map((m) => m.anilistId));
  const seriesKey = mine.find((m) => m.anilistId === anilistId)?.seriesKey ?? null;
  const onPlatform = await platformAnilistIds();
  let added = 0;
  for (const id of earlier) {
    if (have.has(id)) continue;
    const season = await loadWork(id);
    if (!season || hasBlockedGenre(season.genres)) continue;
    // Uma temporada que ninguém trouxe e que a franquia nem conhece não tem página para abrir: fica de fora.
    if (!onPlatform.has(id) && !season.franchiseId) continue;
    try {
      await prisma.anime.create({
        data: {
          userId,
          anilistId: id,
          titleRomaji: season.titleRomaji,
          titleEnglish: season.titleEnglish,
          titleNative: season.titleNative,
          coverImage: season.coverImage,
          bannerImage: season.bannerImage,
          description: season.description,
          episodes: season.episodes,
          status: season.status,
          season: season.season,
          seasonYear: season.seasonYear,
          genres: season.genres,
          seriesKey: seriesKey ?? deriveSeriesInfo(season.titleRomaji).seriesKey,
          seasonNumber: season.seasonNumber,
          watchState: "FINISHED",
        },
      });
      added += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return added;
}

/**
 * Passa por quem acompanha uma temporada mais nova e completa as anteriores (o que já tinha antes desta regra).
 * Barato de repetir: só olha linhas de temporada 2 em diante.
 */
export async function backfillEarlierSeasons(): Promise<number> {
  let added = 0;
  try {
    const later = await prisma.production.findMany({ where: { seasonNumber: { gt: 1 } }, select: { anilistId: true } });
    const rows = await prisma.anime.findMany({
      where: { userId: { not: null }, OR: [{ seasonNumber: { gt: 1 } }, { anilistId: { in: later.map((p) => p.anilistId) } }] },
      select: { userId: true, anilistId: true },
    });
    for (const row of rows) added += await ensureEarlierSeasons(row.userId as string, row.anilistId);
  } catch (error) {
    console.error("[continuation] backfill falhou:", error);
  }
  return added;
}

/**
 * Procura obras que voltaram a sair episódios e atualiza quem as acompanhava. Seguro de rodar a qualquer hora e de
 * repetir: só age sobre o que ainda não foi tratado. Nunca derruba quem chamou.
 */
export async function syncContinuations(now: Date = new Date()): Promise<ContinuationSummary> {
  const summary: ContinuationSummary = { returned: 0, followed: 0, alerts: 0, backfilled: 0 };
  try {
    const upcoming = await prisma.airingScheduleEntry.findMany({
      where: { airingAt: { gte: now } },
      orderBy: { airingAt: "asc" },
      select: { anilistId: true, airingAt: true },
    });
    if (upcoming.length === 0) return summary;
    const firstAt = new Map<number, Date>();
    for (const u of upcoming) if (!firstAt.has(u.anilistId)) firstAt.set(u.anilistId, u.airingAt);
    const airingIds = Array.from(firstAt.keys());
    const onPlatform = await platformAnilistIds();

    // 1) A MESMA obra retomou: a pessoa tinha como terminada (ou em hiato) e agora há episódios por vir.
    const comeback = await prisma.anime.findMany({
      where: { anilistId: { in: airingIds }, userId: { not: null }, status: { in: [...RETURNING_STATUSES] } },
      select: { id: true, userId: true, anilistId: true, watchState: true, user: { select: { notifyReleases: true } } },
    });
    for (const row of comeback) {
      // "Dropei" é uma decisão da pessoa: a obra pode voltar, mas ela não volta sozinha para a agenda nem avisa.
      if (row.watchState === "DROPPED") continue;
      const work = await loadWork(row.anilistId);
      const status = work?.status && !RETURNING_STATUSES.includes(work.status as (typeof RETURNING_STATUSES)[number]) ? work.status : "RELEASING";
      await prisma.anime.update({ where: { id: row.id }, data: { status, watchState: null } });
      summary.returned += 1;
      if (await recordReturnAlert(row.userId as string, row.anilistId, firstAt.get(row.anilistId) as Date, row.user?.notifyReleases !== false)) summary.alerts += 1;
    }

    // 2) UMA CONTINUAÇÃO (nova temporada) está no ar: quem acompanhava a anterior passa a acompanhá-la também.
    for (const anilistId of airingIds) {
      if (!onPlatform.has(anilistId)) continue;
      const work = await loadWork(anilistId);
      if (!work) continue;
      const earlier = await earlierSeasonIds(work);
      if (earlier.length === 0) continue;
      const followers = await prisma.anime.findMany({
        where: { anilistId: { in: earlier }, userId: { not: null } },
        select: { userId: true, seriesKey: true, waiting: true, watchState: true, user: { select: { notifyReleases: true } } },
      });
      // Quem dropou (ou pôs em espera) alguma temporada anterior não quer saber do que vem depois: sem avisos nem agenda.
      const stopped = new Set(followers.filter((f) => f.watchState === "DROPPED" || f.waiting).map((f) => f.userId as string));
      const seen = new Set<string>();
      for (const follower of followers) {
        const userId = follower.userId as string;
        if (seen.has(userId) || stopped.has(userId)) continue;
        seen.add(userId);
        // Já tratada antes (ou a pessoa tirou da lista de propósito): o aviso é a marca de que não se repete.
        const handled = await prisma.airingAlert.findUnique({ where: { userId_anilistId_episode: { userId, anilistId, episode: RETURN_ALERT_EPISODE } } });
        if (handled) continue;
        if (await prisma.anime.findUnique({ where: { userId_anilistId: { userId, anilistId } }, select: { id: true } })) continue;
        if (await followContinuation(userId, work, follower.seriesKey)) {
          summary.followed += 1;
          summary.backfilled += await ensureEarlierSeasons(userId, anilistId);
        }
        if (await recordReturnAlert(userId, anilistId, firstAt.get(anilistId) as Date, follower.user?.notifyReleases !== false)) summary.alerts += 1;
      }
    }
  } catch (error) {
    console.error("[continuation] falhou:", error);
  }
  return summary;
}
