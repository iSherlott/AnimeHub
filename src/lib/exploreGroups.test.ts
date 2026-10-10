import { describe, expect, it } from "vitest";
import type { DiscoverItem } from "./discoverItem";
import { currentSeasonRef, parseSeasonSlug, recentSeasons, scheduleOf, seasonLabel, seasonSlug, splitSeasonItems } from "./exploreGroups";

const NOW = new Date("2026-10-10T15:00:00Z");

function item(overrides: Partial<DiscoverItem>): DiscoverItem {
  return {
    key: "k",
    anilistId: 1,
    kitsuId: null,
    titleRomaji: "T",
    titleEnglish: null,
    titleNative: null,
    coverImage: null,
    bannerImage: null,
    description: null,
    episodes: null,
    genres: [],
    status: null,
    season: null,
    startDate: null,
    endDate: null,
    nextEpisodeNumber: null,
    nextEpisodeAt: null,
    popularityRank: null,
    cached: false,
    inMyList: false,
    animeId: null,
    ...overrides,
  };
}

describe("season identifiers", () => {
  it("labels and slugs the Figma way", () => {
    expect(seasonLabel({ season: "FALL", year: 2026 })).toBe("Autumn2026");
    expect(seasonSlug({ season: "FALL", year: 2026 })).toBe("autumn2026");
    expect(seasonSlug({ season: "WINTER", year: 2027 })).toBe("winter2027");
  });

  it("parses slugs and rejects nonsense", () => {
    expect(parseSeasonSlug("autumn2026")).toEqual({ season: "FALL", year: 2026 });
    expect(parseSeasonSlug("Fall2026")).toEqual({ season: "FALL", year: 2026 });
    expect(parseSeasonSlug("spring1900")).toBeNull();
    expect(parseSeasonSlug("monsoon2026")).toBeNull();
    expect(parseSeasonSlug("../etc")).toBeNull();
  });

  it("walks back across the year boundary", () => {
    expect(currentSeasonRef(NOW)).toEqual({ season: "FALL", year: 2026 });
    expect(recentSeasons(NOW, 4).map(seasonLabel)).toEqual(["Autumn2026", "Summer2026", "Spring2026", "Winter2026"]);
    expect(recentSeasons(new Date("2026-02-01T00:00:00Z"), 3).map(seasonLabel)).toEqual(["Winter2026", "Autumn2025", "Summer2025"]);
  });
});

describe("splitSeasonItems", () => {
  it("puts confirmed future airings first, ordered by time, and the rest by popularity", () => {
    const late = item({ key: "late", nextEpisodeAt: "2026-10-11T20:00:00Z" });
    const soon = item({ key: "soon", nextEpisodeAt: "2026-10-10T16:00:00Z" });
    const past = item({ key: "past", nextEpisodeAt: "2026-10-09T16:00:00Z", popularityRank: 2 });
    const none = item({ key: "none", popularityRank: 1 });
    const { airing, rest } = splitSeasonItems([late, past, none, soon], NOW);
    expect(airing.map((i) => i.key)).toEqual(["soon", "late"]);
    expect(rest.map((i) => i.key)).toEqual(["none", "past"]);
  });
});

describe("scheduleOf", () => {
  it("uses the confirmed time when it is in the future", () => {
    expect(scheduleOf(item({ nextEpisodeAt: "2026-10-10T16:00:00Z", nextEpisodeNumber: 3 }), NOW)).toEqual({
      kind: "scheduled",
      at: "2026-10-10T16:00:00Z",
      episode: 3,
    });
  });

  it("shows a known day without a time, but never trusts day 1", () => {
    expect(scheduleOf(item({ status: "NOT_YET_RELEASED", startDate: "2026-10-11T00:00:00.000Z" }), NOW)).toEqual({ kind: "known-day", day: "2026-10-11" });
    expect(scheduleOf(item({ status: "NOT_YET_RELEASED", startDate: "2026-11-01T00:00:00.000Z" }), NOW)).toEqual({ kind: "tbd", reason: "undated" });
  });

  it("reports hiatus as postponed and anything else as undated", () => {
    expect(scheduleOf(item({ status: "HIATUS" }), NOW)).toEqual({ kind: "tbd", reason: "postponed" });
    expect(scheduleOf(item({}), NOW)).toEqual({ kind: "tbd", reason: "undated" });
  });
});
