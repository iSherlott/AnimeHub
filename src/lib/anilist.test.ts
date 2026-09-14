import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fuzzyDateToISO,
  currentSeason,
  searchAnime,
  getSeasonalAnime,
  getAnimeById,
  getAiringSchedule,
  type AniListMedia,
} from "@/lib/anilist";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function makeMedia(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 1,
    title: { romaji: "Some Anime", english: null, native: null },
    coverImage: { extraLarge: null },
    bannerImage: null,
    description: null,
    episodes: null,
    status: null,
    season: null,
    seasonYear: null,
    genres: [],
    averageScore: null,
    startDate: null,
    endDate: null,
    nextAiringEpisode: null,
    externalLinks: [],
    ...overrides,
  };
}

describe("fuzzyDateToISO", () => {
  it("returns null for a null date", () => {
    expect(fuzzyDateToISO(null)).toBeNull();
  });

  it("returns null when the year is missing", () => {
    expect(fuzzyDateToISO({ year: null, month: 5, day: 10 })).toBeNull();
  });

  it("builds a full ISO date when year/month/day are all present", () => {
    const iso = fuzzyDateToISO({ year: 2024, month: 10, day: 3 });
    expect(iso).toBe(new Date(Date.UTC(2024, 9, 3)).toISOString());
  });

  it("defaults month and day to 1 when only the year is present", () => {
    const iso = fuzzyDateToISO({ year: 2024, month: null, day: null });
    expect(iso).toBe(new Date(Date.UTC(2024, 0, 1)).toISOString());
  });
});

describe("currentSeason", () => {
  it.each([
    [1, "WINTER"],
    [3, "WINTER"],
    [4, "SPRING"],
    [6, "SPRING"],
    [7, "SUMMER"],
    [9, "SUMMER"],
    [10, "FALL"],
    [12, "FALL"],
  ] as const)("maps month %i to %s", (month, season) => {
    const result = currentSeason(new Date(2024, month - 1, 15));
    expect(result.season).toBe(season);
    expect(result.seasonYear).toBe(2024);
  });
});

describe("AniList GraphQL requests", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the query/variables as JSON and returns the unwrapped data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: { Media: makeMedia({ id: 113415 }) } })
    );

    const result = await getAnimeById(113415);

    expect(result.id).toBe(113415);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://graphql.anilist.co");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.variables).toEqual({ id: 113415 });
    expect((init as RequestInit).method).toBe("POST");
  });

  it("throws with the response body when the HTTP request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: "down" }, false, 502));

    await expect(getAnimeById(1)).rejects.toThrow(/AniList request failed \(502\)/);
  });

  it("throws a joined message when AniList returns GraphQL errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: "Not Found." }, { message: "Bad Request." }] })
    );

    await expect(getAnimeById(999999)).rejects.toThrow(
      "AniList GraphQL error: Not Found., Bad Request."
    );
  });

  it("searchAnime returns the media list from the Page", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: { Page: { media: [makeMedia({ id: 1 }), makeMedia({ id: 2 })] } } })
    );

    const result = await searchAnime("some query");

    expect(result.map((m) => m.id)).toEqual([1, 2]);
  });

  it("getSeasonalAnime sends the season and seasonYear as variables", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: { Page: { media: [] } } }));

    await getSeasonalAnime("FALL", 2026);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.variables).toEqual({ season: "FALL", seasonYear: 2026 });
  });
});

describe("getAiringSchedule", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function scheduleEntry(overrides: Record<string, unknown> = {}) {
    return {
      episode: 1,
      airingAt: 1700000000,
      media: {
        id: 1,
        title: { romaji: "Some Anime", english: null, native: null },
        coverImage: { extraLarge: null },
        bannerImage: null,
        genres: [],
        format: "TV",
        ...overrides,
      },
    };
  }

  it("paginates until hasNextPage is false, combining entries from every page", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            Page: {
              pageInfo: { hasNextPage: true },
              airingSchedules: [scheduleEntry({ id: 1 })],
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            Page: {
              pageInfo: { hasNextPage: false },
              airingSchedules: [scheduleEntry({ id: 2 })],
            },
          },
        })
      );

    const result = await getAiringSchedule(0, 100);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);

    const firstPageVariables = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    ).variables;
    const secondPageVariables = JSON.parse(
      (vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string
    ).variables;
    expect(firstPageVariables.page).toBe(1);
    expect(secondPageVariables.page).toBe(2);
  });

  it("filters out formats other than TV/TV_SHORT, but keeps entries with a null format", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: {
          Page: {
            pageInfo: { hasNextPage: false },
            airingSchedules: [
              scheduleEntry({ id: 1, format: "MOVIE" }),
              scheduleEntry({ id: 2, format: "TV" }),
              scheduleEntry({ id: 3, format: "TV_SHORT" }),
              scheduleEntry({ id: 4, format: null }),
            ],
          },
        },
      })
    );

    const result = await getAiringSchedule(0, 100);

    expect(result.map((e) => e.anilistId)).toEqual([2, 3, 4]);
  });

  it("stops after MAX_PAGES even if the API keeps claiming there's a next page", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: {
          Page: {
            pageInfo: { hasNextPage: true },
            airingSchedules: [scheduleEntry()],
          },
        },
      })
    );

    await getAiringSchedule(0, 100);

    expect(fetch).toHaveBeenCalledTimes(10);
  });
});
