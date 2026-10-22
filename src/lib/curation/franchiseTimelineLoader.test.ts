import { describe, expect, it } from "vitest";
import { stepsFromTimeline } from "./franchiseTimelineLoader";
import type { FranchiseTimeline, TimelineEntry } from "./timeline";

const entry = (anilistId: number, kind: string, startDate: string | null, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({
  anilistId, titleRomaji: `T${anilistId}`, titleEnglish: null, titleNative: null, kind, format: null, season: null, seasonYear: startDate ? Number(startDate.slice(0, 4)) : null, startDate, episodes: 12, coverImage: null, current: false, ...extra,
});

describe("stepsFromTimeline", () => {
  it("junta a linha principal, as séries relacionadas e os especiais em ordem de estreia", () => {
    const timeline: FranchiseTimeline = {
      main: [entry(1, "EPISODE", "2020-10-01T00:00:00Z", { seasonNumber: 1, current: true }), entry(2, "EPISODE", "2022-10-01T00:00:00Z", { seasonNumber: 2 })],
      specials: [entry(3, "OVA", "2021-03-01T00:00:00Z"), entry(4, "MOVIE", "2023-01-01T00:00:00Z"), entry(5, "ODA", null)],
      related: [entry(6, "EPISODE", "2021-09-01T00:00:00Z")],
    };
    const steps = stepsFromTimeline(timeline) ?? [];
    expect(steps.map((s) => [s.anilistId, s.role, s.season])).toEqual([
      [1, "MAIN", 1],
      [3, "SPECIAL", null],
      [6, "RELATED", null],
      [2, "MAIN", 2],
      [4, "SPECIAL", null],
      [5, "SPECIAL", null], // sem data: no fim
    ]);
    expect(steps.find((s) => s.current)?.anilistId).toBe(1);
  });

  it("com uma obra só (ou sem linha do tempo) não há franquia para navegar", () => {
    expect(stepsFromTimeline(null)).toBeNull();
    expect(stepsFromTimeline({ main: [entry(1, "EPISODE", "2020-10-01T00:00:00Z", { seasonNumber: 1 })], specials: [], related: [] })).toBeNull();
  });
});
