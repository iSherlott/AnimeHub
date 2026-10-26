import { describe, expect, it } from "vitest";
import { dailyFortune, FORTUNES } from "./dailyFortune";

describe("dailyFortune", () => {
  it("é a mesma frase o dia inteiro para a mesma pessoa", () => {
    const morning = dailyFortune("user-1", new Date("2026-10-26T04:00:00Z")); // 01:00 em São Paulo
    const night = dailyFortune("user-1", new Date("2026-10-27T02:00:00Z")); // 23:00 em São Paulo, mesmo dia
    expect(morning).toBe(night);
    expect(FORTUNES).toContain(morning);
  });

  it("o dia vira no fuso de quem vê, não em UTC", () => {
    // 02:00 UTC do dia 27 ainda é dia 26 em São Paulo e já é dia 27 em Tóquio.
    const instant = new Date("2026-10-27T02:00:00Z");
    expect(dailyFortune("user-1", instant, "America/Sao_Paulo")).toBe(dailyFortune("user-1", new Date("2026-10-26T15:00:00Z"), "America/Sao_Paulo"));
    expect(dailyFortune("user-1", instant, "Asia/Tokyo")).toBe(dailyFortune("user-1", new Date("2026-10-27T05:00:00Z"), "Asia/Tokyo"));
  });

  it("muda ao longo dos dias e varia entre pessoas", () => {
    const days = new Set(Array.from({ length: 30 }, (_, i) => dailyFortune("user-1", new Date(Date.UTC(2026, 9, 1 + i, 15)))));
    expect(days.size).toBeGreaterThan(5);
    const people = new Set(Array.from({ length: 30 }, (_, i) => dailyFortune(`user-${i}`, new Date("2026-10-26T15:00:00Z"))));
    expect(people.size).toBeGreaterThan(5);
  });
});
