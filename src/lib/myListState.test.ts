import { describe, expect, it } from "vitest";
import { myListStateOf } from "./myListState";

const NOW = new Date("2026-10-10T20:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000);
const catalog = (over: Partial<NonNullable<Parameters<typeof myListStateOf>[0]["catalog"]>> = {}) => ({
  status: "RELEASING",
  startDate: null,
  nextEpisodeNumber: null,
  nextEpisodeAt: null,
  ...over,
});

describe("myListStateOf", () => {
  it("prefers a confirmed upcoming episode", () => {
    expect(myListStateOf({ upcoming: { airingAt: hours(5), episode: 4 }, catalog: catalog(), now: NOW })).toEqual({
      kind: "scheduled",
      at: hours(5).toISOString(),
      episode: 4,
    });
  });

  it("marks delayed when the source still lists a long-past episode as next", () => {
    expect(myListStateOf({ upcoming: null, catalog: catalog({ nextEpisodeNumber: 6, nextEpisodeAt: hours(-5) }), now: NOW })).toEqual({
      kind: "delayed",
      at: hours(-5).toISOString(),
      episode: 6,
    });
  });

  it("keeps the original slot out of 'delayed' while inside the grace window", () => {
    expect(myListStateOf({ upcoming: null, catalog: catalog({ nextEpisodeNumber: 6, nextEpisodeAt: hours(-1) }), now: NOW })).toEqual({ kind: "undated" });
  });

  it("reports an exact premiere day without inventing a time", () => {
    expect(
      myListStateOf({ upcoming: null, catalog: catalog({ status: "NOT_YET_RELEASED", startDate: new Date("2026-10-11T00:00:00Z"), nextEpisodeNumber: 1 }), now: NOW })
    ).toEqual({ kind: "dated", day: "2026-10-11", episode: 1 });
  });

  it("never trusts a partial date (day 1) or a premiere already in the past", () => {
    expect(myListStateOf({ upcoming: null, catalog: catalog({ status: "NOT_YET_RELEASED", startDate: new Date("2026-11-01T00:00:00Z") }), now: NOW })).toEqual({ kind: "undated" });
    expect(myListStateOf({ upcoming: null, catalog: catalog({ status: "NOT_YET_RELEASED", startDate: new Date("2026-09-12T00:00:00Z") }), now: NOW })).toEqual({ kind: "undated" });
  });

  it("maps hiatus, finished and missing catalog rows", () => {
    expect(myListStateOf({ upcoming: null, catalog: catalog({ status: "HIATUS" }), now: NOW })).toEqual({ kind: "postponed" });
    expect(myListStateOf({ upcoming: null, catalog: catalog({ status: "FINISHED" }), now: NOW })).toEqual({ kind: "none" });
    expect(myListStateOf({ upcoming: null, catalog: catalog({ status: "CANCELLED" }), now: NOW })).toEqual({ kind: "none" });
    expect(myListStateOf({ upcoming: null, catalog: null, now: NOW })).toEqual({ kind: "undated" });
  });
});
