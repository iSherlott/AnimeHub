import { prisma } from "@/lib/prisma";
import { currentSeason } from "@/lib/anilist";
import { getJikanAnimeNews, JikanError, type JikanNewsItem } from "@/lib/jikan";
import { getSeasonalCatalog } from "@/lib/seasonalCatalog";
import { publishNewsPosts } from "@/lib/newsHub";
import { fetchNewsFeed, matchFeedToAnimes, NEWS_FEED_SOURCE, type FeedItem } from "@/lib/newsRss";
import { startOfDayInZone, DEFAULT_TIME_ZONE } from "@/lib/timeZone";

/**
 * Notícias das obras da temporada atual (Comunidade → Notícias).
 *
 * Roda no serviço `news-fetcher`, chamado pelo painel (Admin → Scrapers) e uma
 * vez por dia. Usa só a API pública da Jikan (espelho aberto da MyAnimeList) a
 * partir do `idMal` que a AniList informa; nada é coletado de sites de terceiros
 * (D-30). O resultado fica em `AnimeNews`, e a Comunidade só lê essa tabela.
 */
export const NEWS_RUN_LOCK_MS = 30 * 60 * 1000;
export const NEWS_TIME_BUDGET_MS = 25 * 60 * 1000;
export const NEWS_PER_ANIME = 8;
export const NEWS_MAX_ANIMES = 400;
/** Jikan: ~3 req/s e 60/min — 1,1 s entre chamadas fica abaixo dos dois. */
const REQUEST_GAP_MS = Number.isFinite(Number(process.env.NEWS_REQUEST_GAP_MS ?? "")) && process.env.NEWS_REQUEST_GAP_MS ? Number(process.env.NEWS_REQUEST_GAP_MS) : 1100;
const RATE_LIMIT_WAIT_MS = 4000;
const KEEP_DAYS = 180;
/** Falhas de rede seguidas na Jikan até desistir dela nesta execução (senão cada obra espera o timeout). */
const JIKAN_GIVE_UP_AFTER = 5;

export type NewsDeps = {
  /** Feed geral (ANN): uma chamada só; as notícias são ligadas às obras pelo título. */
  getFeed: () => Promise<FeedItem[]>;
  getNews: (malId: number) => Promise<JikanNewsItem[]>;
  sleep: (ms: number) => Promise<void>;
  /** Completa o catálogo da temporada (traz o `idMal` de cada obra). */
  ensureSeason: (season: "WINTER" | "SPRING" | "SUMMER" | "FALL", year: number) => Promise<void>;
};

const defaultDeps: NewsDeps = {
  getFeed: () => fetchNewsFeed(),
  getNews: getJikanAnimeNews,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ensureSeason: async (season, year) => {
    // Mesma chave da importação: testes e ambientes sem rede não consultam a AniList.
    if (process.env.IMPORT_PREFETCH_SEASON === "false") return;
    try {
      await getSeasonalCatalog(season, year);
    } catch (error) {
      console.error("[news] não foi possível atualizar o catálogo da temporada:", error);
    }
  },
};

/** A busca diária está "devida" se ainda não houve nenhuma agendada desde a última 00:00 local. */
export function isScheduledNewsDue(now: Date, lastScheduledStart: Date | null, timeZone: string = DEFAULT_TIME_ZONE): boolean {
  const midnight = startOfDayInZone(now, timeZone);
  return lastScheduledStart === null || lastScheduledStart.getTime() < midnight.getTime();
}

export async function isNewsRunning(now: Date = new Date()): Promise<boolean> {
  const running = await prisma.newsRun.findFirst({ where: { status: "RUNNING", startedAt: { gt: new Date(now.getTime() - NEWS_RUN_LOCK_MS) } } });
  return running !== null;
}

export type NewsOutcome =
  | { status: "busy" }
  | { status: "done"; runId: string; result: "OK" | "PARTIAL" | "ERROR"; animes: number; fetched: number; failed: number };

export async function runNewsSync(options: { trigger: "schedule" | "manual"; adminName?: string | null; now?: Date; deps?: NewsDeps }): Promise<NewsOutcome> {
  const now = options.now ?? new Date();
  const deps = options.deps ?? defaultDeps;
  if (await isNewsRunning(now)) return { status: "busy" };
  // Execução anterior que nunca terminou (processo reiniciado): libera o lock.
  await prisma.newsRun.updateMany({
    where: { status: "RUNNING" },
    data: { status: "ERROR", finishedAt: now, message: "Interrompida antes de terminar (serviço reiniciado)." },
  });

  const run = await prisma.newsRun.create({ data: { status: "RUNNING", adminName: options.adminName ?? null, startedAt: now } });
  const started = Date.now();
  let animes = 0;
  let fetched = 0;
  let failed = 0;
  let note = "";

  try {
    const { season, seasonYear } = currentSeason(now);
    await deps.ensureSeason(season, seasonYear);
    const seasonEntries = await prisma.catalogEntry.findMany({
      where: { season, seasonYear, anilistId: { not: null }, onPlatform: true },
      orderBy: [{ popularityRank: "asc" }, { titleRomaji: "asc" }],
      take: NEWS_MAX_ANIMES,
      select: { anilistId: true, malId: true, titleRomaji: true, titleEnglish: true, titleNative: true },
    });
    const targets = seasonEntries.filter((e): e is typeof e & { anilistId: number } => e.anilistId !== null);
    animes = targets.length;
    const sources: string[] = [];

    async function save(anilistId: number, source: string, items: Array<{ url: string; title: string; excerpt: string | null; imageUrl?: string | null; author?: string | null; publishedAt: Date }>) {
      for (const item of items.sort((x, y) => y.publishedAt.getTime() - x.publishedAt.getTime()).slice(0, NEWS_PER_ANIME)) {
        const data = { title: item.title, excerpt: item.excerpt, imageUrl: item.imageUrl ?? null, author: item.author ?? null, publishedAt: item.publishedAt, source, fetchedAt: now };
        const existing = await prisma.animeNews.findUnique({ where: { anilistId_url: { anilistId, url: item.url } }, select: { id: true } });
        await prisma.animeNews.upsert({ where: { anilistId_url: { anilistId, url: item.url } }, create: { anilistId, url: item.url, ...data }, update: data });
        if (!existing) fetched += 1;
      }
    }

    // 1) Feed do Anime News Network: uma requisição, ligada às obras da temporada pelo título.
    try {
      const matched = matchFeedToAnimes(
        await deps.getFeed(),
        targets.map((t) => ({ anilistId: t.anilistId, titles: [t.titleRomaji, t.titleEnglish, t.titleNative].filter((x): x is string => Boolean(x)) }))
      );
      for (const [anilistId, items] of matched) await save(anilistId, NEWS_FEED_SOURCE, items);
      sources.push(`${NEWS_FEED_SOURCE} (${matched.size} obras citadas)`);
    } catch (error) {
      console.error("[news] feed do Anime News Network falhou:", error);
      failed += 1;
      note += " Feed do Anime News Network indisponível.";
    }

    // 2) Jikan (MyAnimeList): uma chamada por obra com idMal.
    let jikanFailures = 0;
    let jikanStreak = 0;
    let jikanOk = 0;
    for (const target of targets) {
      if (target.malId === null) continue;
      if (jikanStreak >= JIKAN_GIVE_UP_AFTER) break;
      if (Date.now() - started > NEWS_TIME_BUDGET_MS) {
        note += " Tempo máximo atingido; o restante fica para a próxima execução.";
        break;
      }
      let items: JikanNewsItem[] | null = null;
      for (let attempt = 0; attempt < 2 && items === null; attempt += 1) {
        try {
          items = await deps.getNews(target.malId);
        } catch (error) {
          // 429: espera e tenta mais uma vez; qualquer outra falha conta como falha da obra.
          if (error instanceof JikanError && error.status === 429 && attempt === 0) {
            await deps.sleep(RATE_LIMIT_WAIT_MS);
            continue;
          }
          console.error(`[news] AniList ${target.anilistId} (MAL ${target.malId}) falhou:`, error);
          break;
        }
      }
      await deps.sleep(REQUEST_GAP_MS);
      if (items === null) {
        jikanFailures += 1;
        jikanStreak += 1;
        continue;
      }
      jikanStreak = 0;
      jikanOk += 1;
      await save(target.anilistId, "MyAnimeList", items);
    }
    if (jikanOk > 0) sources.push(`MyAnimeList via Jikan (${jikanOk} obras)`);
    if (jikanFailures > 0) {
      failed += jikanFailures;
      if (jikanStreak >= JIKAN_GIVE_UP_AFTER) note += " Jikan indisponível; parei de tentar nesta execução.";
    }

    // Cada notícia nova vira uma publicação do NewsHub (mesmo cartão do feed, com a # da obra).
    const posts = await publishNewsPosts(now);

    await prisma.animeNews.deleteMany({ where: { publishedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86400_000) } } });

    const result: "OK" | "PARTIAL" | "ERROR" = failed === 0 ? "OK" : fetched > 0 || sources.length > 0 ? "PARTIAL" : "ERROR";
    const message = `${animes} ${animes === 1 ? "obra" : "obras"} da temporada ${season} ${seasonYear} · ${fetched} ${fetched === 1 ? "notícia nova" : "notícias novas"} · ${posts} ${posts === 1 ? "publicação" : "publicações"} no feed · ${failed} ${failed === 1 ? "falha" : "falhas"}.${sources.length ? ` Fontes: ${sources.join(", ")}.` : ""}${animes === 0 ? " Nenhuma obra no catálogo da temporada." : ""}${note}`;
    await prisma.newsRun.update({ where: { id: run.id }, data: { status: result, finishedAt: new Date(), animes, fetched, failed, message } });
    await prisma.adminLog
      .create({
        data: {
          source: "Jikan",
          level: result === "ERROR" ? "ERROR" : result === "PARTIAL" ? "WARN" : "INFO",
          event: "News synced",
          message,
          context: `${options.trigger === "schedule" ? "Agendado" : "Manual"}${options.adminName ? ` · admin ${options.adminName}` : ""}`,
          adminName: options.adminName ?? null,
        },
      })
      .catch(() => undefined);
    return { status: "done", runId: run.id, result, animes, fetched, failed };
  } catch (error) {
    console.error("[news] execução falhou:", error);
    await prisma.newsRun.update({ where: { id: run.id }, data: { status: "ERROR", finishedAt: new Date(), animes, fetched, failed, message: "Falha inesperada; nada foi apagado." } }).catch(() => undefined);
    return { status: "done", runId: run.id, result: "ERROR", animes, fetched, failed };
  }
}
