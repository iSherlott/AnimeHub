import { describe, expect, it } from "vitest";
import { animeSeasonOf, civilDay, classifyOffGrid, DELAY_GRACE_MS, isDelayed, isExactStartDate } from "./calendarOffGrid";

const NOW = new Date("2026-10-10T20:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

describe("isDelayed", () => {
  it("marks an episode the source still lists as next long after its time", () => {
    expect(isDelayed(hoursAgo(5), 6, { nextEpisodeNumber: 6, nextEpisodeAt: hoursAgo(5) }, NOW)).toBe(true);
  });

  it("is not delayed within the grace window", () => {
    const within = new Date(NOW.getTime() - DELAY_GRACE_MS + 60_000);
    expect(isDelayed(within, 6, { nextEpisodeNumber: 6, nextEpisodeAt: within }, NOW)).toBe(false);
  });

  it("is not delayed once the source moved on to the next episode", () => {
    expect(isDelayed(hoursAgo(5), 6, { nextEpisodeNumber: 7, nextEpisodeAt: new Date(NOW.getTime() + 7 * 86400_000) }, NOW)).toBe(false);
  });

  it("is not delayed without catalog information", () => {
    expect(isDelayed(hoursAgo(5), 6, undefined, NOW)).toBe(false);
    expect(isDelayed(hoursAgo(5), 6, { nextEpisodeNumber: null, nextEpisodeAt: null }, NOW)).toBe(false);
  });
});

describe("classifyOffGrid", () => {
  it("treats an exact day as a known date without time", () => {
    expect(classifyOffGrid({ status: "NOT_YET_RELEASED", startDate: new Date("2026-10-11T00:00:00Z") })).toBe("dated");
  });

  it("never trusts day 1 (partial AniList dates are stored as the 1st)", () => {
    expect(isExactStartDate(new Date("2026-10-01T00:00:00Z"))).toBe(false);
    expect(classifyOffGrid({ status: "NOT_YET_RELEASED", startDate: new Date("2026-10-01T00:00:00Z") })).toBe("undated");
    expect(classifyOffGrid({ status: "NOT_YET_RELEASED", startDate: null })).toBe("undated");
  });

  it("reports hiatus as postponed and ignores everything else", () => {
    expect(classifyOffGrid({ status: "HIATUS", startDate: null })).toBe("postponed");
    expect(classifyOffGrid({ status: "RELEASING", startDate: null })).toBeNull();
    expect(classifyOffGrid({ status: "CANCELLED", startDate: null })).toBeNull();
    expect(classifyOffGrid({ status: null, startDate: null })).toBeNull();
  });
});

describe("helpers", () => {
  it("formats the civil day and the anime season", () => {
    expect(civilDay(new Date("2026-10-11T00:00:00Z"))).toBe("2026-10-11");
    expect(animeSeasonOf(new Date("2026-10-11T00:00:00Z"))).toEqual({ season: "FALL", year: 2026 });
    expect(animeSeasonOf(new Date("2026-01-05T12:00:00Z"))).toEqual({ season: "WINTER", year: 2026 });
  });
});
