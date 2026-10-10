import { describe, expect, it } from "vitest";
import { groupByRelease, rowTimeLabel, sectionsByRelease } from "./myListGroups";

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

describe("sectionsByRelease (Figma 8:2608)", () => {
  const tz = "America/Sao_Paulo";
  const now = new Date("2026-10-10T12:00:00-03:00"); // sábado
  const at = (iso: string) => ({ at: new Date(iso).toISOString() });

  it("splits today, tomorrow, the next days in one range and each day from a week out", () => {
    const sections = sectionsByRelease(
      [
        at("2026-10-17T13:00:00-03:00"),
        at("2026-10-12T20:00:00-03:00"),
        at("2026-10-10T16:00:00-03:00"),
        at("2026-10-16T20:00:00-03:00"),
        at("2026-10-10T13:00:00-03:00"),
        at("2026-10-11T02:00:00-03:00"),
      ],
      now,
      tz
    );
    expect(sections.map((s) => s.key)).toEqual(["today", "tomorrow", "week", "later-2026-10-17"]);
    expect(sections[0]).toMatchObject({ label: "Sábado, 10 outubro", badge: "HOJE · 2 LANÇAMENTOS", nested: false });
    expect(sections[1].label).toBe("Amanhã · Domingo, 11 outubro");
    expect(sections[2].label).toBe("12–16 outubro · Segunda a sexta");
    expect(sections[3].label).toBe("Próximo sábado · 17 outubro");
  });

  it("uses the singular badge for one release", () => {
    expect(sectionsByRelease([at("2026-10-10T16:00:00-03:00")], now, tz)[0].badge).toBe("HOJE · 1 LANÇAMENTO");
  });

  it("labels rows by distance", () => {
    expect(rowTimeLabel("2026-10-10T16:00:00-03:00", now, tz)).toBe("16:00");
    expect(rowTimeLabel("2026-10-11T02:00:00-03:00", now, tz)).toBe("02:00");
    expect(rowTimeLabel("2026-10-12T20:00:00-03:00", now, tz)).toBe("Segunda · 20:00");
    expect(rowTimeLabel("2026-10-17T13:00:00-03:00", now, tz)).toMatch(/^17 out · Sábado · 13:00$/);
  });
});
