import { describe, expect, it } from "vitest";
import { MAX_STREAMING_DELAY_MINUTES, parseStreamingDelay, tvAiringAt, withStreamingDelay } from "./streamingDelay";

describe("atraso do streaming", () => {
  const tv = new Date("2026-10-19T13:00:00Z"); // 22:00 no Japão, 10:00 em São Paulo

  it("o horário do streaming é o da TV mais o atraso, e volta ao da TV ao tirar o atraso", () => {
    const streaming = withStreamingDelay(tv, 120);
    expect(streaming.toISOString()).toBe("2026-10-19T15:00:00.000Z"); // 12:00 em São Paulo
    expect(tvAiringAt(streaming, 120).toISOString()).toBe(tv.toISOString());
  });

  it("sem atraso, o horário fica como veio", () => {
    expect(withStreamingDelay(tv, null)).toBe(tv);
    expect(withStreamingDelay(tv, 0)).toBe(tv);
    expect(tvAiringAt(tv, undefined)).toBe(tv);
  });

  it("valida o pedido do admin", () => {
    expect(parseStreamingDelay({ anilistId: 209219, minutes: 120, site: " Crunchyroll " })).toEqual({ anilistId: 209219, minutes: 120, site: "Crunchyroll" });
    // 0 ou nulo tira o atraso (e a plataforma junto).
    expect(parseStreamingDelay({ anilistId: 209219, minutes: 0, site: "Crunchyroll" })).toEqual({ anilistId: 209219, minutes: null, site: null });
    expect(parseStreamingDelay({ anilistId: 209219, minutes: null })).toEqual({ anilistId: 209219, minutes: null, site: null });
    expect(parseStreamingDelay({ anilistId: 209219, minutes: -30 })).toEqual({ anilistId: 209219, minutes: -30, site: null });
    for (const bad of [null, {}, { anilistId: "1", minutes: 60 }, { anilistId: 0, minutes: 60 }, { anilistId: 1, minutes: 1.5 }, { anilistId: 1, minutes: MAX_STREAMING_DELAY_MINUTES + 1 }, { anilistId: 1, minutes: 60, site: "x".repeat(41) }]) {
      expect(parseStreamingDelay(bad)).toBeNull();
    }
  });
});
