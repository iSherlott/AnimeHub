import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function xmlResponse(xml: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: () => Promise.resolve(xml),
  } as Response;
}

/** anidb.ts reads ANIDB_CLIENT_NAME/VERSION once at module load, so each
 * test that cares about configuration needs a fresh module instance. */
async function loadAnidbModule() {
  vi.resetModules();
  return import("@/lib/anidb");
}

const VALID_ANIME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="15617">
  <picture>274199.jpg</picture>
  <titles>
    <title xml:lang="ja" type="official">呪術廻戦</title>
    <title xml:lang="en" type="main">Jujutsu Kaisen</title>
  </titles>
  <episodecount>24</episodecount>
  <startdate>2020-10-03</startdate>
  <enddate>2021-03-27</enddate>
  <description>Yuuji Itadori joins a secret organization.</description>
  <ratings>
    <permanent count="1234">8.45</permanent>
  </ratings>
  <resources>
    <resource type="1">
      <externalentity>
        <identifier>12345</identifier>
        <url>https://myanimelist.net/anime/12345</url>
      </externalentity>
    </resource>
    <resource type="2">
      <externalentity>
        <url>https://anilist.co/anime/113415</url>
      </externalentity>
    </resource>
  </resources>
  <awards>
    <award>Best Anime 2020</award>
  </awards>
  <episodes>
    <episode id="1">
      <epno type="1">1</epno>
      <airdate>2020-10-03</airdate>
      <title xml:lang="ja">呪いの子</title>
      <title xml:lang="en">Ryomen Sukuna</title>
    </episode>
  </episodes>
</anime>`;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("isAnidbConfigured", () => {
  it("is false when neither env var is set", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "");
    const { isAnidbConfigured } = await loadAnidbModule();

    expect(isAnidbConfigured()).toBe(false);
  });

  it("is false when only one of the two env vars is set", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "");
    const { isAnidbConfigured } = await loadAnidbModule();

    expect(isAnidbConfigured()).toBe(false);
  });

  it("is true when both are set", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { isAnidbConfigured } = await loadAnidbModule();

    expect(isAnidbConfigured()).toBe(true);
  });
});

describe("getAnidbAnimeById", () => {
  it("throws without hitting the network when the client is not configured", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "");
    const { getAnidbAnimeById } = await loadAnidbModule();

    await expect(getAnidbAnimeById(15617)).rejects.toThrow(/AniDB não configurada/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses titles, resources, episodes, rating and awards from a real-shaped response", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    vi.mocked(fetch).mockResolvedValueOnce(xmlResponse(VALID_ANIME_XML));

    const result = await getAnidbAnimeById(15617);

    expect(result).toEqual({
      anidbId: 15617,
      titles: [
        { language: "ja", title: "呪術廻戦", isOfficial: true },
        { language: "en", title: "Jujutsu Kaisen", isOfficial: false },
      ],
      picture: "https://cdn.anidb.net/images/main/274199.jpg",
      description: "Yuuji Itadori joins a secret organization.",
      startDate: "2020-10-03",
      endDate: "2021-03-27",
      episodeCount: 24,
      rating: 8.45,
      ratingVotes: 1234,
      awards: ["Best Anime 2020"],
      resources: {
        "1": "https://myanimelist.net/anime/12345",
        "2": "https://anilist.co/anime/113415",
      },
      episodes: [
        {
          number: "1",
          airDate: "2020-10-03",
          titles: [
            { language: "ja", title: "呪いの子" },
            { language: "en", title: "Ryomen Sukuna" },
          ],
        },
      ],
    });
  });

  // Regression test: real AniDB responses put a `type` attribute on <epno>
  // (1=regular, 2=special, etc.), which makes fast-xml-parser parse its text
  // as a number instead of a string. The old code's `?? String(...)`
  // fallback only stringified when epno was *missing*, so a real AniDB
  // response would silently produce a number where AnidbAnime declares
  // `number: string` — and src/app/api/anime/[id]/refresh/route.ts calls
  // `ep.number.replace(...)` on it, which throws on a number.
  it("always returns episode numbers as strings, even when epno carries a type attribute", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    vi.mocked(fetch).mockResolvedValueOnce(xmlResponse(VALID_ANIME_XML));

    const result = await getAnidbAnimeById(15617);

    expect(result.episodes[0].number).toBe("1");
    expect(typeof result.episodes[0].number).toBe("string");
  });

  // Same bug class as epno: a purely numeric title text (real example: the
  // AniDB main title for "86" is literally "86") gets coerced to a JS
  // number by fast-xml-parser, silently violating `titles[].title: string`.
  it("always returns title text as strings, even when the title is purely numeric", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    const numericTitleXml = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="1">
  <titles>
    <title xml:lang="en" type="main">86</title>
  </titles>
</anime>`;
    vi.mocked(fetch).mockResolvedValueOnce(xmlResponse(numericTitleXml));

    const result = await getAnidbAnimeById(1);

    expect(result.titles[0].title).toBe("86");
    expect(typeof result.titles[0].title).toBe("string");
  });

  // ratingVotes/episodeCount of exactly 0 is a legitimate value (a brand
  // new entry with no votes yet), not a "missing" one — a truthy check
  // (`x ? ... : null`) would wrongly collapse it to null.
  it("does not collapse a legitimate zero into null for episodeCount/ratingVotes", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    const zeroValuesXml = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="1">
  <episodecount>0</episodecount>
  <ratings>
    <permanent count="0">0</permanent>
  </ratings>
</anime>`;
    vi.mocked(fetch).mockResolvedValueOnce(xmlResponse(zeroValuesXml));

    const result = await getAnidbAnimeById(1);

    expect(result.episodeCount).toBe(0);
    expect(result.rating).toBe(0);
    expect(result.ratingVotes).toBe(0);
  });

  it("builds the request URL with the configured client name and version", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    vi.mocked(fetch).mockResolvedValueOnce(xmlResponse(VALID_ANIME_XML));

    await getAnidbAnimeById(15617);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/client=interface&clientver=1&protover=1&aid=15617/)
    );
  });

  it("throws when AniDB responds with an <error> element", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    vi.mocked(fetch).mockResolvedValueOnce(
      xmlResponse(`<error code="302">client version missing or invalid</error>`)
    );

    await expect(getAnidbAnimeById(15617)).rejects.toThrow(
      "AniDB error: client version missing or invalid"
    );
  });

  it("throws when the HTTP response itself is not ok", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    vi.mocked(fetch).mockResolvedValueOnce(xmlResponse("", false, 500));

    await expect(getAnidbAnimeById(15617)).rejects.toThrow(/AniDB request failed \(500\)/);
  });

  it("normalizes single title/episode/resource elements the same as multiple (fast-xml-parser doesn't array-wrap singletons)", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    const singleItemXml = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="1">
  <titles>
    <title xml:lang="en" type="main">Solo Title</title>
  </titles>
  <resources>
    <resource type="1">
      <externalentity>
        <url>https://example.com/1</url>
      </externalentity>
    </resource>
  </resources>
  <episodes>
    <episode id="1">
      <epno>1</epno>
    </episode>
  </episodes>
</anime>`;
    vi.mocked(fetch).mockResolvedValueOnce(xmlResponse(singleItemXml));

    const result = await getAnidbAnimeById(1);

    expect(result.titles).toEqual([{ language: "en", title: "Solo Title", isOfficial: false }]);
    expect(result.resources).toEqual({ "1": "https://example.com/1" });
    expect(result.episodes).toEqual([{ number: "1", airDate: null, titles: [] }]);
  });

  it("defaults optional fields to null/empty when absent from the response", async () => {
    vi.stubEnv("ANIDB_CLIENT_NAME", "interface");
    vi.stubEnv("ANIDB_CLIENT_VERSION", "1");
    const { getAnidbAnimeById } = await loadAnidbModule();
    vi.mocked(fetch).mockResolvedValueOnce(
      xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><anime id="1"></anime>`)
    );

    const result = await getAnidbAnimeById(1);

    expect(result).toEqual({
      anidbId: 1,
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
    });
  });
});
