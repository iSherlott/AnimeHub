import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Anime } from "@prisma/client";
import type { GlobalEpisodeRow } from "@/lib/globalEpisodes";
import type { KitsuAnimeMatch, KitsuEpisode } from "@/lib/kitsu";
import { ensureEpisodes, refetchEpisodes } from "@/lib/episodes";

const { findMany, upsertSourceEpisodes, recentlyChecked, markEpisodesChecked, update, animeFindFirst } = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsertSourceEpisodes: vi.fn(),
  recentlyChecked: vi.fn(),
  markEpisodesChecked: vi.fn(),
  update: vi.fn(),
  animeFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    anime: { update, findFirst: animeFindFirst },
  },
}));

// Fase 4: os episódios são globais (a linha da agenda); a gravação em si é testada em globalEpisodes.test.ts.
vi.mock("@/lib/globalEpisodes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/globalEpisodes")>()),
  loadGlobalEpisodes: findMany,
  upsertSourceEpisodes,
  recentlyChecked,
  markEpisodesChecked,
}));

const { searchKitsuAnime, getKitsuEpisodes } = vi.hoisted(() => ({
  searchKitsuAnime: vi.fn(),
  getKitsuEpisodes: vi.fn(),
}));

vi.mock("@/lib/kitsu", () => ({ searchKitsuAnime, getKitsuEpisodes }));

function makeAnime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: "anime-1",
    catalogEntryId: null,
    userId: null,
    anilistId: 1,
    kitsuId: null,
    malId: null,
    shikimoriId: null,
    anidbId: null,
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

function makeKitsuMatch(overrides: Partial<KitsuAnimeMatch> = {}): KitsuAnimeMatch {
  return {
    kitsuId: 42,
    canonicalTitle: "Some Anime",
    titleJapanese: "何かアニメ",
    posterImage: "https://example.com/cover.jpg",
    coverImage: "https://example.com/banner.jpg",
    synopsis: "A synopsis.",
    episodeCount: 12,
    startDate: "2024-01-01",
    endDate: null,
    genres: ["Action", "Comedy"],
    ...overrides,
  };
}

function makeKitsuEpisode(overrides: Partial<KitsuEpisode> = {}): KitsuEpisode {
  return {
    number: 1,
    seasonNumber: 1,
    titleRomaji: "Episode 1",
    titleEnglish: null,
    titleJapanese: null,
    synopsis: null,
    thumbnail: null,
    airDate: null,
    ...overrides,
  };
}

function makeStoredEpisode(overrides: Partial<GlobalEpisodeRow> = {}): GlobalEpisodeRow {
  return {
    id: "ep-1",
    anilistId: 1,
    episode: 1,
    airingAt: null,
    airDate: null,
    dateCertainty: "UNKNOWN",
    status: "ACTIVE",
    source: "kitsu",
    manualFields: [],
    episodeTitle: "Episode 1",
    episodeTitleEn: null,
    episodeTitleJa: null,
    synopsis: null,
    thumbnail: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  recentlyChecked.mockResolvedValue(false);
  upsertSourceEpisodes.mockImplementation(async (_id: number, _work: unknown, list: unknown[]) => list.length);
});

describe("ensureEpisodes", () => {
  it("returns cached episodes without touching Kitsu when the DB already has them", async () => {
    const cached = [makeStoredEpisode()];
    findMany.mockResolvedValueOnce(cached);

    const result = await ensureEpisodes(makeAnime());

    expect(result.source).toBe("cache");
    expect(result.episodes).toEqual([expect.objectContaining({ number: 1, seasonNumber: 1, titleRomaji: "Episode 1" })]);
    expect(searchKitsuAnime).not.toHaveBeenCalled();
  });

  it("does not ask Kitsu again when it was checked recently, even with no content", async () => {
    findMany.mockResolvedValueOnce([makeStoredEpisode({ episodeTitle: null })]);
    recentlyChecked.mockResolvedValueOnce(true);

    const result = await ensureEpisodes(makeAnime());

    expect(result.source).toBe("cache");
    expect(searchKitsuAnime).not.toHaveBeenCalled();
    expect(getKitsuEpisodes).not.toHaveBeenCalled();
  });

  it("searches Kitsu and enriches the anime when there is no cache and no kitsuId yet", async () => {
    findMany.mockResolvedValueOnce([]); // cache check
    const match = makeKitsuMatch();
    searchKitsuAnime.mockResolvedValueOnce(match);
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]); // after storing

    const result = await ensureEpisodes(makeAnime({ kitsuId: null }));

    expect(searchKitsuAnime).toHaveBeenCalledWith("Some Anime");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "anime-1" },
        data: expect.objectContaining({
          kitsuId: match.kitsuId,
          coverImage: match.posterImage,
          bannerImage: match.coverImage,
          description: match.synopsis,
          episodes: match.episodeCount,
          genres: "Action,Comedy",
        }),
      })
    );
    expect(result.source).toBe("kitsu");
    expect(result.episodes).toHaveLength(1);
  });

  it("reports an error when the anime cannot be found on Kitsu", async () => {
    findMany.mockResolvedValueOnce([]);
    searchKitsuAnime.mockResolvedValueOnce(null);

    const result = await ensureEpisodes(makeAnime());

    expect(result).toEqual({
      episodes: [],
      source: "kitsu",
      error: "Anime não encontrado na Kitsu",
    });
  });

  it("turns an unexpected failure into a friendly error instead of throwing", async () => {
    findMany.mockResolvedValueOnce([]); // cache check
    searchKitsuAnime.mockRejectedValueOnce(new Error("Kitsu request failed (500): boom"));

    const result = await ensureEpisodes(makeAnime());

    expect(result).toEqual({
      episodes: [],
      source: "kitsu",
      error: "Kitsu request failed (500): boom",
    });
  });

  // Regressão: 2 animes com nomes parecidos (ex. "Naruto" / "Naruto
  // Shippuden") podem resolver pro mesmo kitsuId — sem essa checagem, o 2º
  // a carregar quebrava com um erro cru do Prisma (achado real da 8ª
  // rodada de auditoria, Epic 18).
  it("still fetches episodes, but does not persist kitsuId, when another anime of the same user already claimed it", async () => {
    findMany.mockResolvedValueOnce([]); // cache check
    const match = makeKitsuMatch();
    searchKitsuAnime.mockResolvedValueOnce(match);
    animeFindFirst.mockResolvedValueOnce({ id: "other-anime" }); // conflito
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]);

    const result = await ensureEpisodes(makeAnime({ userId: "user-1", kitsuId: null }));

    expect(animeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", kitsuId: match.kitsuId, NOT: { id: "anime-1" } },
      })
    );
    const [[updateArgs]] = update.mock.calls;
    expect(updateArgs.data).not.toHaveProperty("kitsuId");
    expect(updateArgs.data.coverImage).toBe(match.posterImage);
    expect(result.source).toBe("kitsu");
    expect(result.episodes).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it("persists kitsuId normally when it isn't claimed by anyone else", async () => {
    findMany.mockResolvedValueOnce([]);
    const match = makeKitsuMatch();
    searchKitsuAnime.mockResolvedValueOnce(match);
    animeFindFirst.mockResolvedValueOnce(null); // sem conflito
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]);

    await ensureEpisodes(makeAnime({ userId: "user-1", kitsuId: null }));

    const [[updateArgs]] = update.mock.calls;
    expect(updateArgs.data.kitsuId).toBe(match.kitsuId);
  });

  it("skips the Kitsu search entirely when a kitsuId is already known", async () => {
    findMany.mockResolvedValueOnce([]); // cache check
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]);

    await ensureEpisodes(makeAnime({ kitsuId: 99 }));

    expect(searchKitsuAnime).not.toHaveBeenCalled();
    expect(getKitsuEpisodes).toHaveBeenCalledWith(99);
  });
});

describe("refetchEpisodes", () => {
  // Regression test for the bug found in the "reativar outras fontes" cycle:
  // the "Atualizar dados" refresh button's Kitsu step only restored episode
  // rows, silently leaving coverImage/bannerImage/description/genres empty
  // for an anime that already had a kitsuId. This must always search Kitsu
  // and re-fill those fields, not just conditionally set kitsuId.
  it("restores cover/banner/description/genres even when kitsuId is already set", async () => {
    const anime = makeAnime({
      kitsuId: 42,
      coverImage: null,
      bannerImage: null,
      description: null,
      genres: null,
      episodes: null,
    });
    const match = makeKitsuMatch();
    searchKitsuAnime.mockResolvedValueOnce(match);
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]);

    const result = await refetchEpisodes(anime);

    expect(searchKitsuAnime).toHaveBeenCalledWith("Some Anime");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "anime-1" },
        data: expect.objectContaining({
          coverImage: match.posterImage,
          bannerImage: match.coverImage,
          description: match.synopsis,
          episodes: match.episodeCount,
          genres: "Action,Comedy",
        }),
      })
    );
    expect(result.source).toBe("kitsu");
  });

  it("does not clobber fields the user already filled in manually", async () => {
    const anime = makeAnime({
      kitsuId: 42,
      coverImage: "https://mine.example/custom-cover.jpg",
      genres: "Manually,Curated",
    });
    searchKitsuAnime.mockResolvedValueOnce(makeKitsuMatch());
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]);

    await refetchEpisodes(anime);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coverImage: "https://mine.example/custom-cover.jpg",
          genres: "Manually,Curated",
        }),
      })
    );
  });

  it("still fetches episodes, but does not persist kitsuId, when another anime of the same user already claimed it", async () => {
    const match = makeKitsuMatch();
    searchKitsuAnime.mockResolvedValueOnce(match);
    animeFindFirst.mockResolvedValueOnce({ id: "other-anime" });
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]);

    const result = await refetchEpisodes(makeAnime({ userId: "user-1", kitsuId: null }));

    const [[updateArgs]] = update.mock.calls;
    expect(updateArgs.data).not.toHaveProperty("kitsuId");
    expect(result.source).toBe("kitsu");
    expect(result.error).toBeUndefined();
  });

  it("falls back to the existing kitsuId when the Kitsu search comes up empty", async () => {
    searchKitsuAnime.mockResolvedValueOnce(null);
    getKitsuEpisodes.mockResolvedValueOnce([makeKitsuEpisode()]);
    findMany.mockResolvedValueOnce([makeStoredEpisode()]);

    const result = await refetchEpisodes(makeAnime({ kitsuId: 77 }));

    expect(update).not.toHaveBeenCalled();
    expect(getKitsuEpisodes).toHaveBeenCalledWith(77);
    expect(result.source).toBe("kitsu");
  });

  it("errors out when there is no kitsuId and the Kitsu search finds nothing", async () => {
    searchKitsuAnime.mockResolvedValueOnce(null);

    const result = await refetchEpisodes(makeAnime({ kitsuId: null }));

    expect(result).toEqual({
      episodes: [],
      source: "kitsu",
      error: "Anime não encontrado na Kitsu",
    });
    expect(getKitsuEpisodes).not.toHaveBeenCalled();
  });

  it("deduplicates episodes that repeat the same number, keeping the first occurrence", async () => {
    searchKitsuAnime.mockResolvedValueOnce(makeKitsuMatch());
    getKitsuEpisodes.mockResolvedValueOnce([
      makeKitsuEpisode({ number: 1, titleRomaji: "First copy" }),
      makeKitsuEpisode({ number: 1, titleRomaji: "Duplicate copy" }),
      makeKitsuEpisode({ number: 2, titleRomaji: "Episode 2" }),
    ]);
    findMany.mockResolvedValueOnce([]);

    await refetchEpisodes(makeAnime({ kitsuId: 42 }));

    const [[anilistId, , list, source, mode]] = upsertSourceEpisodes.mock.calls;
    expect([anilistId, source, mode]).toEqual([1, "kitsu", "refresh"]);
    expect(list).toEqual([expect.objectContaining({ number: 1, titleRomaji: "First copy" }), expect.objectContaining({ number: 2, titleRomaji: "Episode 2" })]);
    expect(markEpisodesChecked).toHaveBeenCalledWith(1, 42, 2);
  });

  // Regressão (13ª rodada de auditoria, Epic 18): number "reinicia a cada temporada" interna da Kitsu (ex.: One Piece).
  // O dedup por (temporada, número) passa as duas temporadas adiante; no episódio global (Fase 4) o número repetido é
  // ambíguo e o upsert o deixa de fora (ver globalEpisodes.unambiguous) em vez de gravar a temporada errada.
  it("passes episodes from different internal seasons on, even when their per-season number repeats", async () => {
    searchKitsuAnime.mockResolvedValueOnce(makeKitsuMatch());
    getKitsuEpisodes.mockResolvedValueOnce([
      makeKitsuEpisode({ number: 1, seasonNumber: 1, titleRomaji: "S1E1" }),
      makeKitsuEpisode({ number: 2, seasonNumber: 1, titleRomaji: "S1E2" }),
      makeKitsuEpisode({ number: 1, seasonNumber: 2, titleRomaji: "S2E1" }),
      makeKitsuEpisode({ number: 2, seasonNumber: 2, titleRomaji: "S2E2" }),
    ]);
    findMany.mockResolvedValueOnce([]);

    await refetchEpisodes(makeAnime({ kitsuId: 42 }));

    expect(upsertSourceEpisodes.mock.calls[0][2]).toEqual([
      expect.objectContaining({ number: 1, seasonNumber: 1, titleRomaji: "S1E1" }),
      expect.objectContaining({ number: 2, seasonNumber: 1, titleRomaji: "S1E2" }),
      expect.objectContaining({ number: 1, seasonNumber: 2, titleRomaji: "S2E1" }),
      expect.objectContaining({ number: 2, seasonNumber: 2, titleRomaji: "S2E2" }),
    ]);
  });

  it("reports an error when Kitsu has no episodes registered", async () => {
    searchKitsuAnime.mockResolvedValueOnce(makeKitsuMatch());
    getKitsuEpisodes.mockResolvedValueOnce([]);

    const result = await refetchEpisodes(makeAnime({ kitsuId: 42 }));

    expect(result).toEqual({
      episodes: [],
      source: "kitsu",
      error: "Sem episódios cadastrados na Kitsu",
    });
    expect(markEpisodesChecked).toHaveBeenCalledWith(1, 42, 0);
  });

  it("turns an unexpected failure into a friendly error instead of throwing", async () => {
    searchKitsuAnime.mockRejectedValueOnce(new Error("Kitsu request failed (500): boom"));

    const result = await refetchEpisodes(makeAnime({ kitsuId: 42 }));

    expect(result).toEqual({
      episodes: [],
      source: "kitsu",
      error: "Kitsu request failed (500): boom",
    });
  });
});
