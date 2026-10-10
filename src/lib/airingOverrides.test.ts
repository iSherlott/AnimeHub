import { describe, expect, it } from "vitest";
import { applyAiringOverrides, overrideKey } from "./airingOverrides";

describe("applyAiringOverrides", () => {
  const entries = [
    { anilistId: 1, episode: 3, airingAt: new Date("2026-10-10T16:00:00Z"), titleRomaji: "A" },
    { anilistId: 1, episode: 4, airingAt: new Date("2026-10-17T16:00:00Z"), titleRomaji: "A" },
  ];

  it("replaces only the overridden episode and keeps the rest of the entry", () => {
    const value = new Date("2026-10-11T16:00:00Z");
    const result = applyAiringOverrides(entries, new Map([[overrideKey(1, 3), value]]));
    expect(result[0].airingAt).toEqual(value);
    expect(result[0].titleRomaji).toBe("A");
    expect(result[1].airingAt).toEqual(entries[1].airingAt);
  });

  it("returns the same list when there is nothing to override", () => {
    expect(applyAiringOverrides(entries, new Map())).toBe(entries);
  });
});
