import { describe, expect, it } from "vitest";
import { BLOCK_MINUTES, layoutDayEvents, minutesFromClock } from "./calendarGrid";

describe("minutesFromClock", () => {
  it("converte HH:MM em minutos desde a meia-noite", () => {
    expect(minutesFromClock("00:00")).toBe(0);
    expect(minutesFromClock("13:30")).toBe(810);
    expect(minutesFromClock("23:59")).toBe(1439);
  });
});

describe("layoutDayEvents", () => {
  it("evento sozinho ocupa a coluna toda", () => {
    expect(layoutDayEvents([600])).toEqual([{ index: 0, lane: 0, lanes: 1 }]);
  });

  it("eventos distantes (>= a altura do bloco) não dividem a coluna", () => {
    const out = layoutDayEvents([0, BLOCK_MINUTES, BLOCK_MINUTES * 2]);
    expect(out.every((e) => e.lanes === 1 && e.lane === 0)).toBe(true);
  });

  it("dois eventos que se tocam ficam lado a lado", () => {
    const out = layoutDayEvents([1200, 1260]); // 20:00 e 21:00
    expect(out[0]).toMatchObject({ lane: 0, lanes: 2 });
    expect(out[1]).toMatchObject({ lane: 1, lanes: 2 });
  });

  it("mantém a ordem de entrada e reaproveita faixas livres", () => {
    // 18:00, 19:00 (colide), 22:00 (livre de novo)
    const out = layoutDayEvents([1320, 1080, 1140]);
    expect(out[0]).toMatchObject({ lane: 0, lanes: 1 }); // 22:00 sozinho
    expect(out[1]).toMatchObject({ lane: 0, lanes: 2 }); // 18:00
    expect(out[2]).toMatchObject({ lane: 1, lanes: 2 }); // 19:00
  });

  it("três eventos encadeados formam um grupo de três faixas quando o 3º colide com o 1º", () => {
    const out = layoutDayEvents([600, 620, 640]);
    expect(out.map((e) => e.lanes)).toEqual([3, 3, 3]);
    expect(out.map((e) => e.lane)).toEqual([0, 1, 2]);
  });
});
