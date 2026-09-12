import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchShikimoriAnime } from "@/lib/shikimori";

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

describe("searchShikimoriAnime", () => {
  it("returns null when the search list is empty", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

    const result = await searchShikimoriAnime("Nonexistent Anime");

    expect(result).toBeNull();
  });

  it("merges the detail fetch over the list entry and prefixes the image domain", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([{ id: 42, name: "Some Anime", image: { original: "/list.jpg" } }]))
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Some Anime (Full)",
          image: { original: "/detail.jpg" },
          episodes: 24,
          score: "8.12",
          genres: [{ name: "Action" }, { name: "Fantasy" }],
          description: "Full synopsis.",
        })
      );

    const result = await searchShikimoriAnime("Some Anime");

    expect(result).toEqual({
      shikimoriId: 42,
      name: "Some Anime (Full)",
      imageUrl: "https://shikimori.one/detail.jpg",
      episodes: 24,
      score: 8.12,
      genres: ["Action", "Fantasy"],
      description: "Full synopsis.",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/animes/42"),
      expect.anything()
    );
  });

  it("falls back to the list entry when the detail fetch fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse([{ id: 42, name: "Some Anime", image: { original: "/list.jpg" } }])
      )
      .mockResolvedValueOnce(jsonResponse({}, false, 500));

    const result = await searchShikimoriAnime("Some Anime");

    expect(result).toEqual({
      shikimoriId: 42,
      name: "Some Anime",
      imageUrl: "https://shikimori.one/list.jpg",
      episodes: null,
      score: null,
      genres: [],
      description: null,
    });
  });

  it("sends the required User-Agent header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

    await searchShikimoriAnime("Some Anime");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      "User-Agent": expect.stringContaining("AnimeHub"),
    });
  });

  it("throws a descriptive error when the list request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, false, 403));

    await expect(searchShikimoriAnime("Some Anime")).rejects.toThrow(
      /Shikimori request failed \(403\)/
    );
  });

  it("does not collapse a legitimate zero score into null", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: "Unscored Anime" }]))
      .mockResolvedValueOnce(jsonResponse({ name: "Unscored Anime", score: 0 }));

    const result = await searchShikimoriAnime("Unscored Anime");

    expect(result?.score).toBe(0);
  });
});
