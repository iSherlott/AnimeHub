import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Anime } from "@prisma/client";
import type { AnidbAnime } from "@/lib/anidb";

// DISABLE_OTHER_SOURCES é lido pra uma const no módulo, na hora do import —
// precisa estar setado ANTES do import dinâmico abaixo, não só antes de
// chamar a função. Com isso, o passo AniList/Kitsu/Jikan/Shikimori inteiro
// é pulado e só o passo da AniDB roda, que é o único testado aqui (mesmo
// "modo de teste" que o comentário do próprio arquivo já documenta).
process.env.DISABLE_OTHER_SOURCES = "true";

const { findMany, deleteMany, createMany, upsert, count, animeUpdate, findUniqueOrThrow, findUnique } = vi.hoisted(
  () => ({
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
    animeUpdate: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findUnique: vi.fn(),
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    episode: { findMany, deleteMany, createMany, upsert, count },
    anime: { update: animeUpdate, findUniqueOrThrow, findUnique },
  },
}));

const { getAnidbAnimeById, isAnidbConfigured } = vi.hoisted(() => ({
  getAnidbAnimeById: vi.fn(),
  isAnidbConfigured: vi.fn(),
}));

vi.mock("@/lib/anidb", () => ({ getAnidbAnimeById, isAnidbConfigured }));

// callInternalService (usado por resolveIdentity) já retorna null sozinho
// quando a URL não está configurada — não precisa mockar; NAME_RESOLVER_URL
// nunca está setado no ambiente de teste.

function makeAnime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: "anime-1",
    userId: "user-1",
    anilistId: 1,
    kitsuId: null,
    malId: null,
    shikimoriId: null,
    anidbId: 999,
    anidbRating: null,
    anidbVotes: null,
    averageScore: null,
    anidbAwards: null,
    anidbResources: null,
    anidbTitles: null,
    lastRefreshedAt: null,
    titleRomaji: "Some Anime",
    titleEnglish: null,
    titleNative: null,
    titlePortuguese: null,
    titleFurigana: null,
    coverImage: null,
    bannerImage: null,
    officialSite: null,
    trailerId: null,
    trailerSite: null,
    castJson: null,
    recommendationsJson: null,
    accentColor: null,
    description: null,
    descriptionPortuguese: null,
    episodes: null,
    format: null,
    status: null,
    season: null,
    seasonYear: null,
    genres: null,
    seriesKey: null,
    seasonNumber: 1,
    isFavorite: false,
    favoritedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAnidbAnime(overrides: Partial<AnidbAnime> = {}): AnidbAnime {
  return {
    anidbId: 999,
    titles: [],
    picture: null,
    description: null,
    startDate: null,
    endDate: null,
    episodeCount: null,
    rating: null,
    ratingVotes: null,
    awards: [],
    resources: {},
    episodes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isAnidbConfigured.mockReturnValue(true);
  animeUpdate.mockResolvedValue(undefined);
  upsert.mockResolvedValue(undefined);
  count.mockResolvedValue(0);
  // Lido em segundo plano pra extrair a cor de destaque (fire-and-forget) —
  // null faz esse passo desistir cedo, sem precisar mockar mais nada dele.
  findUnique.mockResolvedValue(null);
});

describe("refreshAnimeData — passo da AniDB, preservação de seasonNumber/sinopse/miniatura", () => {
  // Regressão da 13ª rodada de auditoria (Epic 18): a AniDB não tem conceito
  // de temporada, então seu deleteMany+createMany de episódios só sabia
  // recriar tudo com seasonNumber=1 (default do schema) — colapsando
  // qualquer anime multi-season (numeração da Kitsu, que reinicia por
  // temporada) de volta pra uma temporada só. A 1ª correção guardava os
  // episódios existentes num Map chaveado só por `number`, que ainda assim
  // perdia informação quando 2 temporadas diferentes compartilhavam o mesmo
  // number (ex.: S1E1 e S2E1) — só um dos 2 sobrevivia no Map, arriscando
  // atribuir a temporada errada. Este teste cobre exatamente esse caso.
  it("não herda seasonNumber/sinopse/miniatura quando o number já existente é ambíguo entre temporadas", async () => {
    findMany.mockResolvedValueOnce([
      { number: 1, seasonNumber: 1, synopsis: "Sinopse da S1E1", thumbnail: "s1e1.jpg" },
      { number: 1, seasonNumber: 2, synopsis: "Sinopse da S2E1", thumbnail: "s2e1.jpg" },
    ]);
    getAnidbAnimeById.mockResolvedValueOnce(
      makeAnidbAnime({
        episodes: [{ number: "1", airDate: null, titles: [{ language: "en", title: "Episode One" }] }],
      })
    );

    const { refreshAnimeData } = await import("@/lib/refreshAnimeData");
    await refreshAnimeData(makeAnime());

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { animeId_seasonNumber_number: { animeId: "anime-1", seasonNumber: 1, number: 1 } },
        create: expect.objectContaining({
          number: 1,
          seasonNumber: 1, // cai pro padrão seguro, não arrisca qual das 2 temporadas
          synopsis: null,
          thumbnail: null,
        }),
      })
    );
  });

  it("herda seasonNumber/sinopse/miniatura normalmente quando o number já existente não é ambíguo", async () => {
    findMany.mockResolvedValueOnce([
      { number: 1, seasonNumber: 1, synopsis: "Sinopse da S1E1", thumbnail: "s1e1.jpg" },
      { number: 2, seasonNumber: 2, synopsis: "Sinopse da S2E2", thumbnail: "s2e2.jpg" },
    ]);
    getAnidbAnimeById.mockResolvedValueOnce(
      makeAnidbAnime({
        episodes: [
          { number: "1", airDate: null, titles: [] },
          { number: "2", airDate: null, titles: [] },
        ],
      })
    );

    const { refreshAnimeData } = await import("@/lib/refreshAnimeData");
    await refreshAnimeData(makeAnime());

    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { animeId_seasonNumber_number: { animeId: "anime-1", seasonNumber: 1, number: 1 } },
        create: expect.objectContaining({ synopsis: "Sinopse da S1E1", thumbnail: "s1e1.jpg" }),
      })
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { animeId_seasonNumber_number: { animeId: "anime-1", seasonNumber: 2, number: 2 } },
        create: expect.objectContaining({ synopsis: "Sinopse da S2E2", thumbnail: "s2e2.jpg" }),
      })
    );
  });

  // Regressão da 14ª rodada de auditoria (Epic 18): a correção anterior
  // ainda apagava TODOS os episódios do anime (deleteMany({animeId}))
  // antes de recriar só o subconjunto que a AniDB devolveu — destruindo de
  // verdade (não só reagrupando errado) episódios de outras temporadas que
  // a própria AniDB nem menciona, já que ela não agrupa por temporada como
  // a Kitsu (1 anidbId cobre só 1 temporada/cour). Este teste garante que
  // nenhum `deleteMany` roda mais nesse passo.
  it("nunca apaga episódios de outras temporadas que a AniDB não menciona", async () => {
    findMany.mockResolvedValueOnce([
      { number: 1, seasonNumber: 1, synopsis: null, thumbnail: null },
      { number: 1, seasonNumber: 2, synopsis: null, thumbnail: null },
      { number: 2, seasonNumber: 2, synopsis: null, thumbnail: null },
    ]);
    // A AniDB só devolve 1 episódio (uma temporada/cour só) — bem menos do
    // que o anime já tem gravado nas outras temporadas.
    getAnidbAnimeById.mockResolvedValueOnce(
      makeAnidbAnime({ episodes: [{ number: "1", airDate: null, titles: [] }] })
    );

    const { refreshAnimeData } = await import("@/lib/refreshAnimeData");
    await refreshAnimeData(makeAnime());

    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
