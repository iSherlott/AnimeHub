import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchJikanAnime } from "@/lib/jikan";

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

describe("searchJikanAnime", () => {
  it("returns null when Jikan has no matching anime", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [] }));

    const result = await searchJikanAnime("Nonexistent Anime");

    expect(result).toBeNull();
  });

  it("maps the first result, merging genres and themes into one list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            mal_id: 12345,
            synopsis: "A great story.",
            genres: [{ name: "Comedy" }, { name: "Drama" }],
            themes: [{ name: "Isekai" }],
            score: 8.4,
            episodes: 24,
          },
        ],
      })
    );

    const result = await searchJikanAnime("Some Anime");

    // "Drama" não tem mapeamento na taxonomia fechada (Epic 3, confirmado
    // com o usuário) e é descartado — só Comedy/Isekai sobrevivem.
    expect(result).toEqual({
      malId: 12345,
      synopsis: "A great story.",
      genres: ["Comedy", "Isekai"],
      score: 8.4,
      episodes: 24,
    });
  });

  it("defaults missing optional fields to null and empty genres", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: [{ mal_id: 1 }] })
    );

    const result = await searchJikanAnime("Some Anime");

    expect(result).toEqual({
      malId: 1,
      synopsis: null,
      genres: [],
      score: null,
      episodes: null,
    });
  });

  it("URL-encodes the search title", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await searchJikanAnime("Re:Zero − Starting Life");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("Re:Zero − Starting Life"))
    );
  });

  it("throws a descriptive error when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ message: "rate limited" }, false, 429)
    );

    await expect(searchJikanAnime("Some Anime")).rejects.toThrow(
      /Jikan request failed \(429\)/
    );
  });
});
