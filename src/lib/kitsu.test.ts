import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getKitsuGenres, searchKitsuAnime, getKitsuEpisodes } from "@/lib/kitsu";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getKitsuGenres", () => {
  it("maps category titles and drops falsy ones", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          { attributes: { title: "Action" } },
          { attributes: { title: null } },
          { attributes: {} },
        ],
      })
    );

    const result = await getKitsuGenres(42);

    expect(result).toEqual(["Action"]);
  });

  it("returns an empty array when there is no data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));

    expect(await getKitsuGenres(42)).toEqual([]);
  });

  it("throws a descriptive error when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: "down" }, false, 503));

    await expect(getKitsuGenres(42)).rejects.toThrow(/Kitsu request failed \(503\)/);
  });
});

describe("searchKitsuAnime", () => {
  it("returns null when there is no matching entry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [] }));

    expect(await searchKitsuAnime("Nonexistent")).toBeNull();
  });

  it("maps titles/images/genres, preferring original over large and falling back through the chain", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "42",
              attributes: {
                canonicalTitle: "Some Anime",
                titles: { ja_jp: "何かアニメ" },
                posterImage: { large: "poster-large.jpg", medium: "poster-medium.jpg" },
                coverImage: { large: "cover-large.jpg", original: "cover-original.jpg" },
                synopsis: "A synopsis.",
                episodeCount: 12,
                startDate: "2024-01-01",
                endDate: null,
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ attributes: { title: "Action" } }] })
      );

    const result = await searchKitsuAnime("Some Anime");

    expect(result).toEqual({
      kitsuId: 42,
      canonicalTitle: "Some Anime",
      titleJapanese: "何かアニメ",
      posterImage: "poster-large.jpg",
      coverImage: "cover-original.jpg",
      synopsis: "A synopsis.",
      episodeCount: 12,
      startDate: "2024-01-01",
      endDate: null,
      genres: ["Action"],
    });
  });

  it("falls back through the image size chain when large is missing", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "1",
              attributes: {
                canonicalTitle: "Some Anime",
                posterImage: { medium: "poster-medium.jpg" },
                coverImage: { original: "cover-original.jpg" },
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    const result = await searchKitsuAnime("Some Anime");

    expect(result?.posterImage).toBe("poster-medium.jpg");
    expect(result?.coverImage).toBe("cover-original.jpg");
  });

  it("defaults titleJapanese/dates to null and images to null when absent", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "1", attributes: { canonicalTitle: "Some Anime" } }] })
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    const result = await searchKitsuAnime("Some Anime");

    expect(result).toMatchObject({
      titleJapanese: null,
      posterImage: null,
      coverImage: null,
      synopsis: null,
      episodeCount: null,
      startDate: null,
      endDate: null,
      genres: [],
    });
  });

  it("swallows a genre-fetch failure and returns an empty genre list instead of throwing", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "1", attributes: { canonicalTitle: "Some Anime" } }] })
      )
      .mockResolvedValueOnce(jsonResponse({}, false, 500));

    const result = await searchKitsuAnime("Some Anime");

    expect(result?.genres).toEqual([]);
  });
});

describe("getKitsuEpisodes", () => {
  it("follows links.next across pages, rewriting it relative to the base URL", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ attributes: { number: 1, canonicalTitle: "Episode 1" } }],
          links: { next: "https://kitsu.io/api/edge/anime/42/episodes?page[offset]=20" },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ attributes: { number: 2, canonicalTitle: "Episode 2" } }],
          links: {},
        })
      );

    const result = await getKitsuEpisodes(42);

    expect(result.map((e) => e.number)).toEqual([1, 2]);
    expect(fetch).toHaveBeenCalledTimes(2);
    // links.next comes back as an absolute URL; the code strips the base URL
    // off it and re-prepends the same base before fetching again, so the
    // second call should land on the exact same absolute URL — not a
    // doubled-up "https://.../api/edgehttps://.../api/edge/..." string.
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      "https://kitsu.io/api/edge/anime/42/episodes?page[offset]=20"
    );
  });

  it("skips entries with a null episode number", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          { attributes: { number: null, canonicalTitle: "No number" } },
          { attributes: { number: 1, canonicalTitle: "Episode 1" } },
        ],
        links: {},
      })
    );

    const result = await getKitsuEpisodes(42);

    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
  });

  it("defaults seasonNumber to 1 and falls back titleRomaji to the English title", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            attributes: {
              number: 1,
              titles: { en: "English Title" },
              thumbnail: { medium: "thumb-medium.jpg" },
              airdate: "2024-01-01",
            },
          },
        ],
        links: {},
      })
    );

    const result = await getKitsuEpisodes(42);

    expect(result[0]).toEqual({
      number: 1,
      seasonNumber: 1,
      titleRomaji: "English Title",
      titleJapanese: null,
      thumbnail: "thumb-medium.jpg",
      airDate: "2024-01-01",
    });
  });

  it("stops after the safety guard even if the API keeps returning a next link", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          data: [{ attributes: { number: 1 } }],
          links: { next: "https://kitsu.io/api/edge/anime/42/episodes?page[offset]=20" },
        })
      )
    );

    await getKitsuEpisodes(42);

    expect(fetch).toHaveBeenCalledTimes(100);
  });
});
