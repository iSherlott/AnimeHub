import { describe, expect, it } from "vitest";
import { animeSeasonOf, civilDay, classifyOffGrid, isExactStartDate } from "./calendarOffGrid";


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
