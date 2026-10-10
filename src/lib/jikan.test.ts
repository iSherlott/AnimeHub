import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getJikanAnimeNews, JikanError, searchJikanAnime } from "@/lib/jikan";

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
            title: "Some Anime",
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

  // Regressão: MAL/Jikan mudou pra separar demografia (Shounen/Shoujo/Seinen)
  // e conteúdo explícito (Hentai/Yaoi/Yuri) em arrays próprios, fora de
  // `genres`/`themes` — sem ler esses dois campos, 3 das 18 categorias da
  // taxonomia fechada nunca chegavam a ser vistas vindo dessa fonte.
  it("also merges demographics and explicit_genres into the genre list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            mal_id: 1,
            title: "Some Anime",
            genres: [{ name: "Action" }],
            themes: [],
            demographics: [{ name: "Shounen" }],
            explicit_genres: [{ name: "Yaoi" }],
          },
        ],
      })
    );

    const result = await searchJikanAnime("Some Anime");

    expect(result?.genres).toEqual(["Shounen", "Yaoi"]);
  });

  it("defaults missing optional fields to null and empty genres", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: [{ mal_id: 1, title: "Some Anime" }] })
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

  // Mesma proteção do Kitsu (ver identityResolution.test.ts) — a busca da
  // Jikan também quase sempre devolve algum resultado, relevante ou não.
  it("rejects the top result when its title doesn't match what was searched", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [{ mal_id: 1, title: "Completely Unrelated Anime" }],
      })
    );

    expect(await searchJikanAnime("My Test Anime")).toBeNull();
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

describe("getJikanAnimeNews", () => {
  it("maps news, keeping only https links with title and a valid date", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: [
          { url: "https://myanimelist.net/news/1", title: " Season 2 announced ", date: "2026-10-01T12:00:00+00:00", author_username: "reporter", excerpt: "Details...", images: { jpg: { image_url: "https://cdn.myanimelist.net/a.jpg" } } },
          { url: "http://insecure.example/2", title: "No https", date: "2026-10-01T12:00:00+00:00" },
          { url: "https://myanimelist.net/news/3", title: "Bad date", date: "not-a-date" },
          { url: "https://myanimelist.net/news/4", title: "", date: "2026-10-02T00:00:00+00:00" },
          { url: "https://myanimelist.net/news/5", title: "No image", date: "2026-10-03T00:00:00+00:00", images: { jpg: { image_url: "http://x/y.jpg" } } },
        ],
      })
    );

    const news = await getJikanAnimeNews(55);

    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/anime/55/news");
    expect(news.map((n) => n.url)).toEqual(["https://myanimelist.net/news/1", "https://myanimelist.net/news/5"]);
    expect(news[0]).toMatchObject({ title: "Season 2 announced", author: "reporter", imageUrl: "https://cdn.myanimelist.net/a.jpg", excerpt: "Details..." });
    expect(news[1].imageUrl).toBeNull();
  });

  it("exposes the HTTP status so callers can wait on 429", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, false, 429));

    await expect(getJikanAnimeNews(1)).rejects.toMatchObject({ status: 429 });
    expect(new JikanError(429, "x")).toBeInstanceOf(Error);
  });
});
