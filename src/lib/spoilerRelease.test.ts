import { describe, expect, it } from "vitest";
import { episodeAiredAt, isSpoilerReleased, RELEASE_AFTER_DAYS } from "./spoilerRelease";

const now = new Date("2026-11-10T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 3600 * 1000);

describe("spoiler liberado por tempo", () => {
  it(`abre ${RELEASE_AFTER_DAYS} dias depois da estreia, nem um minuto antes`, () => {
    expect(isSpoilerReleased(daysAgo(7), now)).toBe(true);
    expect(isSpoilerReleased(new Date(daysAgo(7).getTime() + 60_000), now)).toBe(false);
    expect(isSpoilerReleased(daysAgo(30), now)).toBe(true);
    expect(isSpoilerReleased(null, now)).toBe(false);
  });

  it("usa o horário do episódio; sem horário, o dia", () => {
    expect(episodeAiredAt({ airingAt: daysAgo(1), airDate: daysAgo(3) })).toEqual(daysAgo(1));
    expect(episodeAiredAt({ airingAt: null, airDate: daysAgo(3) })).toEqual(daysAgo(3));
    expect(episodeAiredAt({ airingAt: null, airDate: null })).toBeNull();
  });
});
