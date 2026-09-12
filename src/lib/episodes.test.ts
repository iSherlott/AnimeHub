import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Anime, Episode } from "@prisma/client";
import type { KitsuAnimeMatch, KitsuEpisode } from "@/lib/kitsu";
import { ensureEpisodes, refetchEpisodes } from "@/lib/episodes";

const { findMany, deleteMany, createMany, update } = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    episode: { findMany, deleteMany, createMany },
    anime: { update },
  },
}));

const { searchKitsuAnime, getKitsuEpisodes } = vi.hoisted(() => ({
  searchKitsuAnime: vi.fn(),
  getKitsuEpisodes: vi.fn(),
}));

vi.mock("@/lib/kitsu", () => ({ searchKitsuAnime, getKitsuEpisodes }));

function makeAnime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: "anime-1",
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
    description: null,
    episodes: null,
    format: null,
    status: null,
    season: null,
    seasonYear: null,
    genres: null,
    seriesKey: null,
    seasonNumber: 1,
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
    titleJapanese: null,
    thumbnail: null,
    airDate: null,
    ...overrides,
  };
}

function makeStoredEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "ep-1",
    animeId: "anime-1",
    number: 1,
    seasonNumber: 1,
    titleRomaji: "Episode 1",
    titleJapanese: null,
    thumbnail: null,
    airDate: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureEpisodes", () => {
  it("returns cached episodes without touching Kitsu when the DB already has them", async () => {
    const cached = [makeStoredEpisode()];
    findMany.mockResolvedValueOnce(cached);

    const result = await ensureEpisodes(makeAnime());

    expect(result).toEqual({ episodes: cached, source: "cache" });
    expect(searchKitsuAnime).not.toHaveBeenCalled();
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

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ number: 1, titleRomaji: "First copy" }),
          expect.objectContaining({ number: 2, titleRomaji: "Episode 2" }),
        ],
      })
    );
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
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
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
