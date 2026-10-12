import { describe, expect, it } from "vitest";
import { mergeFromEpisode, summarizePending, WEEK_MS } from "@/lib/pending";

const now = new Date("2026-10-14T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 24 * 3600 * 1000);
const ahead = (days: number) => new Date(now.getTime() + days * 24 * 3600 * 1000);

describe("mergeFromEpisode", () => {
  it("a primeira pendência guarda o episódio adiado", () => {
    expect(mergeFromEpisode(null, 2)).toBe(2);
  });
  it("adiar um episódio mais novo mantém onde parou", () => {
    expect(mergeFromEpisode(2, 3)).toBe(2);
  });
  it("adiar um episódio mais antigo recua o ponto onde parou", () => {
    expect(mergeFromEpisode(4, 2)).toBe(2);
  });
});

describe("summarizePending", () => {
  it("parou no EP02 e o EP03 saiu esta semana: 2 para ver, com o próximo agendado", () => {
    const s = summarizePending(
      2,
      [
        { episode: 1, airingAt: ago(14) },
        { episode: 2, airingAt: ago(8) },
        { episode: 3, airingAt: ago(1) },
        { episode: 4, airingAt: ahead(6) },
      ],
      now
    );
    expect(s.latestAired).toBe(3);
    expect(s.latestAiredThisWeek).toBe(true);
    expect(s.behind).toBe(2);
    expect(s.next).toEqual({ episode: 4, at: ahead(6) });
  });

  it("último episódio de mais de uma semana não é 'esta semana'", () => {
    const s = summarizePending(2, [{ episode: 2, airingAt: new Date(now.getTime() - WEEK_MS - 1000) }], now);
    expect(s.latestAiredThisWeek).toBe(false);
    expect(s.behind).toBe(1);
    expect(s.next).toBeNull();
  });

  it("sem nenhum episódio no ar ainda, nada para ver", () => {
    const s = summarizePending(1, [{ episode: 1, airingAt: ahead(2) }], now);
    expect(s.latestAired).toBeNull();
    expect(s.behind).toBe(0);
    expect(s.next?.episode).toBe(1);
  });

  it("o próximo é o mais cedo entre os futuros, mesmo fora de ordem", () => {
    const s = summarizePending(1, [{ episode: 5, airingAt: ahead(10) }, { episode: 3, airingAt: ahead(3) }], now);
    expect(s.next?.episode).toBe(3);
  });
});
