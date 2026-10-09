import { describe, expect, it } from "vitest";
import { buildWeekDays, startOfWeekMonday } from "./calendarWeek";

// Local-time constructors (sem "Z"): a função trabalha no fuso da máquina.
describe("startOfWeekMonday", () => {
  it("returns Monday 00:00 for any day of that week (Sunday belongs to the week that ends on it)", () => {
    // 05/10/2026 é segunda; 11/10/2026 é domingo
    const monday = new Date(2026, 9, 5);
    for (let d = 5; d <= 11; d += 1) {
      const result = startOfWeekMonday(new Date(2026, 9, d, 15, 30));
      expect(result.getTime()).toBe(monday.getTime());
    }
  });

  it("moves by whole weeks with weekOffset", () => {
    const next = startOfWeekMonday(new Date(2026, 9, 7), 1);
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 9, 12]);
    const prev = startOfWeekMonday(new Date(2026, 9, 7), -2);
    expect([prev.getFullYear(), prev.getMonth(), prev.getDate()]).toEqual([2026, 8, 21]);
  });
});

describe("buildWeekDays", () => {
  it("lists Monday through Sunday", () => {
    const days = buildWeekDays(0, new Date(2026, 9, 10)); // sábado
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1);
    expect(days[6].getDay()).toBe(0);
    expect(days[0].getDate()).toBe(5);
    expect(days[6].getDate()).toBe(11);
  });
});
