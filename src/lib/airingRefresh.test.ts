import { describe, expect, it } from "vitest";
import { buildWeekSlices, evaluateLoaderHealth, WEEK_SECONDS, type LoaderState } from "./airingRefresh";

describe("buildWeekSlices", () => {
  const now = 1_800_000_000;

  it("starts with the current week so a late failure never drops it", () => {
    const slices = buildWeekSlices(now, 8, 8);
    expect(slices[0]).toEqual({ from: now, to: now + WEEK_SECONDS });
  });

  it("covers weeksBack + current + weeksAhead weeks without gaps or overlaps", () => {
    const slices = buildWeekSlices(now, 8, 8);
    expect(slices).toHaveLength(8 + 1 + 8);
    const sorted = [...slices].sort((a, b) => a.from - b.from);
    expect(sorted[0].from).toBe(now - 8 * WEEK_SECONDS);
    expect(sorted[sorted.length - 1].to).toBe(now + 9 * WEEK_SECONDS);
    for (let i = 1; i < sorted.length; i += 1) expect(sorted[i].from).toBe(sorted[i - 1].to);
  });

  it("supports asymmetric windows", () => {
    expect(buildWeekSlices(now, 0, 0)).toHaveLength(1);
    expect(buildWeekSlices(now, 2, 0)).toHaveLength(3);
    expect(buildWeekSlices(now, 0, 3)).toHaveLength(4);
  });
});

describe("evaluateLoaderHealth", () => {
  const base: LoaderState = {
    lastSuccessAt: 1_000_000,
    firstCycleDone: true,
    upcomingEntries: 120,
    truncatedSlices: 0,
    lastError: null,
  };
  const maxStale = 75 * 60 * 1000;

  it("reports starting (healthy) before the first cycle finishes", () => {
    const r = evaluateLoaderHealth({ ...base, firstCycleDone: false, lastSuccessAt: null }, 2_000_000, maxStale);
    expect(r).toMatchObject({ ok: true, status: "starting" });
  });

  it("is healthy after a recent successful cycle with upcoming data", () => {
    expect(evaluateLoaderHealth(base, 1_000_000 + 60_000, maxStale)).toMatchObject({ ok: true, status: "ok" });
  });

  it("fails when the last success is older than the tolerance, citing the last error", () => {
    const r = evaluateLoaderHealth({ ...base, lastError: "429" }, 1_000_000 + maxStale + 1, maxStale);
    expect(r.ok).toBe(false);
    expect(r.status).toBe("stale");
    expect(r.reasons.join(" ")).toContain("429");
  });

  it("fails when the cycle succeeded but ingested nothing in the future (the original P0)", () => {
    const r = evaluateLoaderHealth({ ...base, upcomingEntries: 0 }, 1_000_000 + 1000, maxStale);
    expect(r).toMatchObject({ ok: false, status: "no-upcoming-data" });
  });

  it("stays healthy but reports truncation", () => {
    const r = evaluateLoaderHealth({ ...base, truncatedSlices: 2 }, 1_000_000 + 1000, maxStale);
    expect(r.ok).toBe(true);
    expect(r.reasons[0]).toContain("2");
  });

  it("fails when no cycle ever succeeded", () => {
    const r = evaluateLoaderHealth({ ...base, lastSuccessAt: null }, 5_000_000, maxStale);
    expect(r.ok).toBe(false);
  });
});

import { findStaleEntryIds } from "./airingRefresh";

describe("findStaleEntryIds", () => {
  const existing = [
    { id: "a", anilistId: 1, episode: 3 },
    { id: "b", anilistId: 1, episode: 4 },
    { id: "c", anilistId: 2, episode: 1 },
  ];

  it("flags cached episodes the source no longer lists (cancelled/renumbered)", () => {
    expect(findStaleEntryIds(existing, [{ anilistId: 1, episode: 3 }, { anilistId: 2, episode: 1 }])).toEqual(["b"]);
  });

  it("keeps everything when the source still lists it all", () => {
    expect(findStaleEntryIds(existing, [
      { anilistId: 1, episode: 3 },
      { anilistId: 1, episode: 4 },
      { anilistId: 2, episode: 1 },
    ])).toEqual([]);
  });

  it("flags every row when the source returned nothing for the window", () => {
    expect(findStaleEntryIds(existing, [])).toEqual(["a", "b", "c"]);
  });
});
