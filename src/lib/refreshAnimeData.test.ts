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

const { upsertSourceEpisodes } = vi.hoisted(() => ({ upsertSourceEpisodes: vi.fn() }));
vi.mock("@/lib/globalEpisodes", () => ({ upsertSourceEpisodes }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    episode: { findMany, deleteMany, createMany, upsert, count },
    airingScheduleEntry: { count },
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
    catalogEntryId: null,
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
    waiting: false,
    waitingSince: null,
    watchState: null,
    userScore: null,
    scoredAt: null,
    favoritedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAnidbAnime(overrides: Partial<AnidbAnime> = {}): AnidbAnime {
  return {
    anidbId: 999,
    type: null,
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

describe("refreshAnimeData — passo da AniDB grava no episódio global (Fase 4)", () => {
  it("manda título e dia de cada episódio para o episódio global da obra, em modo refresh", async () => {
    getAnidbAnimeById.mockResolvedValueOnce(
      makeAnidbAnime({
        episodes: [
          { number: "1", airDate: "2026-10-05", titles: [{ language: "en", title: "Episode One" }, { language: "x-jat", title: "Dai Ichi Wa" }, { language: "ja", title: "第一話" }] },
          { number: "2", airDate: null, titles: [] },
        ],
      })
    );
    count.mockResolvedValueOnce(2);

    const { refreshAnimeData } = await import("@/lib/refreshAnimeData");
    const result = await refreshAnimeData(makeAnime());

    const [[anilistId, , list, source, mode]] = upsertSourceEpisodes.mock.calls;
    expect([anilistId, source, mode]).toEqual([1, "anidb", "refresh"]);
    expect(list[0]).toEqual({ number: 1, titleRomaji: "Dai Ichi Wa", titleEnglish: "Episode One", titleJapanese: "第一話", airDate: new Date("2026-10-05") });
    expect(list[1]).toMatchObject({ number: 2, airDate: null });
    expect(result.episodeCount).toBe(2);
    expect(upsert).not.toHaveBeenCalled(); // a tabela por usuário (Episode) não recebe mais gravações
  });

  it("especial da AniDB (S1, C2…) não vira o episódio 1, 2… da obra", async () => {
    getAnidbAnimeById.mockResolvedValueOnce(makeAnidbAnime({ episodes: [{ number: "S1", airDate: null, titles: [] }] }));

    const { refreshAnimeData } = await import("@/lib/refreshAnimeData");
    await refreshAnimeData(makeAnime());

    expect(upsertSourceEpisodes.mock.calls[0][2][0].number).toBe(0); // 0 = descartado pelo upsert (sem numeração regular)
  });
});
