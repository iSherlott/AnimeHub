import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { certaintyFor, hasAired, releaseState, timed } = await import("@/lib/episodeState");
const { unambiguous } = await import("@/lib/globalEpisodes");

const now = new Date("2026-10-24T12:00:00Z");
const ep = (over: Partial<{ airingAt: Date | null; airDate: Date | null; status: string }> = {}) => ({ airingAt: null, airDate: null, status: "ACTIVE", ...over });

describe("estado do episódio global", () => {
  it("separa exibido, agendado, previsto e sem data — nunca inventa", () => {
    expect(releaseState(ep({ airingAt: new Date("2026-10-24T10:00:00Z") }), now)).toBe("AIRED");
    expect(releaseState(ep({ airingAt: new Date("2026-10-25T10:00:00Z") }), now)).toBe("SCHEDULED");
    expect(releaseState(ep({ airDate: new Date("2026-10-30T00:00:00Z") }), now)).toBe("EXPECTED");
    expect(releaseState(ep(), now)).toBe("UNKNOWN_DATE");
  });

  it("só com o dia: o próprio dia ainda não conta como exibido (o horário não é conhecido)", () => {
    expect(hasAired(ep({ airDate: new Date("2026-10-24T00:00:00Z") }), now)).toBe(false);
    expect(hasAired(ep({ airDate: new Date("2026-10-23T00:00:00Z") }), now)).toBe(true);
  });

  it("adiado e cancelado não contam como exibidos, mesmo com data antiga", () => {
    const past = new Date("2026-10-01T10:00:00Z");
    expect(releaseState(ep({ airingAt: past, status: "POSTPONED" }), now)).toBe("POSTPONED");
    expect(releaseState(ep({ airingAt: past, status: "CANCELLED" }), now)).toBe("CANCELLED");
    expect(hasAired(ep({ airingAt: past, status: "CANCELLED" }), now)).toBe(false);
  });

  it("a certeza acompanha os valores", () => {
    expect(certaintyFor(now, null)).toBe("EXACT");
    expect(certaintyFor(null, now)).toBe("DATE_ONLY");
    expect(certaintyFor(null, null)).toBe("UNKNOWN");
  });

  it("timed deixa só os episódios com instante", () => {
    expect(timed([{ airingAt: now }, { airingAt: null }])).toHaveLength(1);
  });
});

describe("episódios de fontes externas", () => {
  it("número repetido na mesma resposta é ambíguo e fica de fora; zero e negativos também", () => {
    const list = [{ number: 1 }, { number: 2 }, { number: 2 }, { number: 0 }, { number: 3 }];
    expect(unambiguous(list).map((e) => e.number)).toEqual([1, 3]);
  });
});
