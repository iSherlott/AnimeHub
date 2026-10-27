import { describe, expect, it } from "vitest";
import {
  buildWeekDaysInZone,
  dayKeyInZone,
  formatTimeInZone,
  timeZoneLabel,
  zonedLocalToUtc,
  isValidTimeZone,
  resolveTimeZone,
  startOfDayInZone,
  startOfWeekMondayInZone,
} from "./timeZone";

describe("resolveTimeZone", () => {
  it("defaults to America/Sao_Paulo, honors a valid IANA zone and the device option", () => {
    expect(resolveTimeZone(null)).toBe("America/Sao_Paulo");
    expect(resolveTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(resolveTimeZone("device", "Europe/Lisbon")).toBe("Europe/Lisbon");
    expect(resolveTimeZone("device", undefined)).toBe("America/Sao_Paulo");
  });
  it("rejects invalid zones instead of throwing", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(resolveTimeZone("Mars/Olympus")).toBe("America/Sao_Paulo");
  });
});

describe("start of day / week in a zone", () => {
  it("midnight in São Paulo (UTC-3) is 03:00Z", () => {
    const d = startOfDayInZone(new Date("2026-10-10T15:00:00Z"), "America/Sao_Paulo");
    expect(d.toISOString()).toBe("2026-10-10T03:00:00.000Z");
  });

  it("the day boundary depends on the zone", () => {
    const instant = new Date("2026-10-11T02:00:00Z");
    expect(dayKeyInZone(instant, "America/Sao_Paulo")).toBe("2026-10-10");
    expect(dayKeyInZone(instant, "UTC")).toBe("2026-10-11");
    expect(dayKeyInZone(instant, "Asia/Tokyo")).toBe("2026-10-11");
  });

  it("week starts Monday: Sat 10/10/2026 gives Mon 05/10 in São Paulo", () => {
    const monday = startOfWeekMondayInZone(new Date("2026-10-10T15:00:00Z"), 0, "America/Sao_Paulo");
    expect(monday.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    const next = startOfWeekMondayInZone(new Date("2026-10-10T15:00:00Z"), 1, "America/Sao_Paulo");
    expect(next.toISOString()).toBe("2026-10-12T03:00:00.000Z");
  });

  it("Sunday belongs to the week that ends on it", () => {
    const monday = startOfWeekMondayInZone(new Date("2026-10-11T20:00:00Z"), 0, "America/Sao_Paulo");
    expect(monday.toISOString()).toBe("2026-10-05T03:00:00.000Z");
  });

  it("respects daylight saving time (New York, DST ends 01/11/2026)", () => {
    const ref = new Date("2026-11-03T12:00:00Z");
    const days = buildWeekDaysInZone(0, "America/New_York", ref);
    expect(days).toHaveLength(7);
    expect(days[0].toISOString()).toBe("2026-11-02T05:00:00.000Z"); // seg 02/11 00:00 EST
    const prevWeek = buildWeekDaysInZone(-1, "America/New_York", ref);
    expect(prevWeek[0].toISOString()).toBe("2026-10-26T04:00:00.000Z"); // seg 26/10 00:00 EDT
    expect(prevWeek[6].toISOString()).toBe("2026-11-01T04:00:00.000Z"); // dom 01/11 00:00 EDT
  });

  it("builds Monday to Sunday consecutive local days", () => {
    const days = buildWeekDaysInZone(0, "America/Sao_Paulo", new Date("2026-10-10T15:00:00Z"));
    expect(days.map((d) => dayKeyInZone(d, "America/Sao_Paulo"))).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });
});

describe("formatTimeInZone", () => {
  it("formats 24h time in the given zone", () => {
    const instant = new Date("2026-10-10T16:00:00Z");
    expect(formatTimeInZone(instant, "America/Sao_Paulo")).toBe("13:00");
    expect(formatTimeInZone(instant, "Asia/Tokyo")).toBe("01:00");
    expect(formatTimeInZone(instant, "UTC")).toBe("16:00");
  });
});

describe("zonedLocalToUtc", () => {
  it("converts wall-clock time in the zone to the UTC instant", () => {
    expect(zonedLocalToUtc("2026-10-10T13:00", "America/Sao_Paulo")?.toISOString()).toBe("2026-10-10T16:00:00.000Z");
    expect(zonedLocalToUtc("2026-10-10T13:00", "Asia/Tokyo")?.toISOString()).toBe("2026-10-10T04:00:00.000Z");
    expect(zonedLocalToUtc("2026-07-01T09:30", "Europe/London")?.toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(zonedLocalToUtc("2026-10-10 13:00", "UTC")).toBeNull();
    expect(zonedLocalToUtc("", "UTC")).toBeNull();
  });
});

describe("timeZoneLabel", () => {
  it("mostra o fuso pelo nome que a pessoa reconhece, não pelo identificador", () => {
    expect(timeZoneLabel("America/Sao_Paulo")).toBe("horário de Brasília");
    expect(timeZoneLabel("America/Sao_Paulo", true)).toBe("Horário de Brasília");
    expect(timeZoneLabel("Asia/Tokyo", true)).toBe("Horário do Japão");
    expect(timeZoneLabel("UTC")).toBe("UTC");
  });

  it("fuso fora da lista (o do dispositivo) vira o horário da cidade", () => {
    expect(timeZoneLabel("America/Argentina/Cordoba")).toBe("horário de Cordoba");
    expect(timeZoneLabel("Pacific/Port_Moresby", true)).toBe("Horário de Port Moresby");
  });
});
