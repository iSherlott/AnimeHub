import { describe, expect, it } from "vitest";
import { groupByRelease } from "./myListGroups";

const TZ = "America/Sao_Paulo";
// 2026-10-10 12:00 em São Paulo (UTC-3) = 15:00Z
const now = new Date("2026-10-10T15:00:00Z");
const item = (id: string, nextAiringAt: string | null) => ({ id, nextAiringAt });

describe("groupByRelease", () => {
  it("groups today, tomorrow, upcoming weekdays, later and unknown, in that order", () => {
    const groups = groupByRelease(
      [
        item("unknown", null),
        item("later", "2026-11-20T16:00:00Z"),
        item("week", "2026-10-14T16:00:00Z"),
        item("tomorrow", "2026-10-11T16:00:00Z"),
        item("today", "2026-10-10T22:00:00Z"),
      ],
      now,
      TZ
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "tomorrow", "day-2026-10-14", "later", "unknown"]);
    expect(groups[0].label).toBe("Hoje");
    expect(groups[2].label).toMatch(/quarta/i);
    expect(groups[4].label).toBe("Sem previsão confirmada");
  });

  it("respects the time zone for the day boundary", () => {
    // 02:00Z de 11/10 ainda é 23:00 de 10/10 em São Paulo → "Hoje"
    const tz = groupByRelease([item("a", "2026-10-11T02:00:00Z")], now, TZ);
    expect(tz[0].key).toBe("today");
    // ...mas em UTC já é "Amanhã"
    const utc = groupByRelease([item("a", "2026-10-11T02:00:00Z")], now, "UTC");
    expect(utc[0].key).toBe("tomorrow");
  });

  it("sorts items inside a group by release time and never invents a date", () => {
    const groups = groupByRelease([item("late", "2026-10-10T23:00:00Z"), item("early", "2026-10-10T18:00:00Z")], now, TZ);
    expect(groups[0].items.map((i) => i.id)).toEqual(["early", "late"]);
    expect(groupByRelease([item("x", null)], now, TZ)[0].key).toBe("unknown");
  });

  it("returns no groups for an empty list", () => {
    expect(groupByRelease([], now, TZ)).toEqual([]);
  });
});
