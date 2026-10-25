import { describe, expect, it } from "vitest";
import { summarizePending } from "@/lib/pending";

const now = new Date("2026-10-14T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 24 * 3600 * 1000);
const ahead = (days: number) => new Date(now.getTime() + days * 24 * 3600 * 1000);

// D5 (Fase 4): adiar vale para a obra; o resumo só traz fatos globais da obra, nada de "parei no" nem "faltam ver".
describe("summarizePending", () => {
  it("o EP03 saiu esta semana e o EP04 está agendado", () => {
    const summary = summarizePending(
      [
        { episode: 2, airingAt: ago(8) },
        { episode: 3, airingAt: ago(1) },
        { episode: 4, airingAt: ahead(6) },
      ],
      now
    );
    expect(summary).toEqual({ latestAired: 3, latestAiredThisWeek: true, next: { episode: 4, at: ahead(6) } });
    expect(summary).not.toHaveProperty("behind");
  });

  it("último episódio de mais de uma semana não é 'esta semana'", () => {
    const summary = summarizePending([{ episode: 5, airingAt: ago(9) }], now);
    expect(summary.latestAired).toBe(5);
    expect(summary.latestAiredThisWeek).toBe(false);
  });

  it("sem nenhum episódio no ar ainda, nada exibido", () => {
    const summary = summarizePending([{ episode: 1, airingAt: ahead(1) }], now);
    expect(summary.latestAired).toBeNull();
    expect(summary.next?.episode).toBe(1);
  });

  it("o próximo é o mais cedo entre os futuros, mesmo fora de ordem; sem data, adiado ou cancelado não é próximo", () => {
    const summary = summarizePending(
      [
        { episode: 7, airingAt: ahead(14) },
        { episode: 6, airingAt: ahead(7) },
        { episode: 8, airingAt: null },
        { episode: 5, airingAt: ahead(2), status: "POSTPONED" },
      ],
      now
    );
    expect(summary.next?.episode).toBe(6);
  });

  it("episódio só com o dia conta como exibido depois do dia", () => {
    const summary = summarizePending([{ episode: 9, airingAt: null, airDate: new Date("2026-10-12T00:00:00Z") }], now);
    expect(summary.latestAired).toBe(9);
  });
});
