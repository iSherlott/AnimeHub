import { describe, it, expect } from "vitest";
import {
  isAiringNow,
  notifyRangeForNow,
  airingAtRangeForNow,
  AIRING_WINDOW_BEFORE_MS,
  AIRING_WINDOW_AFTER_MS,
} from "@/lib/airingWindow";

describe("isAiringNow", () => {
  const airingAt = new Date("2026-01-01T12:00:00.000Z");

  it("is true exactly at the airing time", () => {
    expect(isAiringNow(airingAt, airingAt)).toBe(true);
  });

  it("is true just before the airing time, within the before-window", () => {
    const now = new Date(airingAt.getTime() - AIRING_WINDOW_BEFORE_MS + 1000);
    expect(isAiringNow(airingAt, now)).toBe(true);
  });

  it("is false just before the before-window starts", () => {
    const now = new Date(airingAt.getTime() - AIRING_WINDOW_BEFORE_MS - 1000);
    expect(isAiringNow(airingAt, now)).toBe(false);
  });

  it("is true just before the after-window ends", () => {
    const now = new Date(airingAt.getTime() + AIRING_WINDOW_AFTER_MS - 1000);
    expect(isAiringNow(airingAt, now)).toBe(true);
  });

  it("is false just after the after-window ends", () => {
    const now = new Date(airingAt.getTime() + AIRING_WINDOW_AFTER_MS + 1000);
    expect(isAiringNow(airingAt, now)).toBe(false);
  });

  it("accepts an ISO string for airingAt", () => {
    expect(isAiringNow(airingAt.toISOString(), airingAt)).toBe(true);
  });
});

describe("airingAtRangeForNow", () => {
  // Garante que a faixa usada pela consulta no banco (services/notifier,
  // que filtra por airingAt) sempre concorda com isAiringNow (usado pelo
  // indicador do calendário, que filtra por now) — as duas janelas já
  // saíram dessincronizadas uma vez por reimplementar essa inversão à mão
  // nos dois lugares.
  const now = new Date("2026-01-01T12:00:00.000Z");
  const { from, to } = airingAtRangeForNow(now);

  it("agrees with isAiringNow at the range boundaries", () => {
    expect(isAiringNow(from, now)).toBe(true);
    expect(isAiringNow(to, now)).toBe(true);
    expect(isAiringNow(new Date(from.getTime() - 1000), now)).toBe(false);
    expect(isAiringNow(new Date(to.getTime() + 1000), now)).toBe(false);
  });

  it("agrees with isAiringNow across a spread of sample airingAt values", () => {
    for (let offsetMin = -60; offsetMin <= 60; offsetMin += 5) {
      const airingAt = new Date(now.getTime() + offsetMin * 60 * 1000);
      const inRange = airingAt >= from && airingAt <= to;
      expect(inRange).toBe(isAiringNow(airingAt, now));
    }
  });

  it("spans exactly AIRING_WINDOW_AFTER_MS before now and AIRING_WINDOW_BEFORE_MS after now", () => {
    expect(from.getTime()).toBe(now.getTime() - AIRING_WINDOW_AFTER_MS);
    expect(to.getTime()).toBe(now.getTime() + AIRING_WINDOW_BEFORE_MS);
  });
});

describe("notifyRangeForNow", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("covers today's upcoming releases (24 h ahead) and the ones that just aired", () => {
    const { from, to } = notifyRangeForNow(now);
    expect(from.getTime()).toBe(now.getTime() - 30 * 60 * 1000);
    expect(to.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it("is wider than the on-air window, so a reminder exists long before the episode starts", () => {
    expect(notifyRangeForNow(now).to.getTime()).toBeGreaterThan(airingAtRangeForNow(now).to.getTime());
  });
});
