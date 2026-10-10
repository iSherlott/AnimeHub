import { describe, expect, it } from "vitest";
import { currentSeasonTag } from "./season";

describe("currentSeasonTag", () => {
  it("outubro cai no outono (Fall) do ano", () => {
    const s = currentSeasonTag(new Date("2026-10-09T15:00:00Z"));
    expect(s).toMatchObject({ tag: "AnimeFall2026", key: "animefall2026", label: "Autumn2026", labelPt: "Outono" });
  });

  it("cobre as quatro estações", () => {
    expect(currentSeasonTag(new Date("2026-02-10T12:00:00Z")).english).toBe("Winter");
    expect(currentSeasonTag(new Date("2026-05-10T12:00:00Z")).english).toBe("Spring");
    expect(currentSeasonTag(new Date("2026-08-10T12:00:00Z")).english).toBe("Summer");
    expect(currentSeasonTag(new Date("2026-12-10T12:00:00Z")).english).toBe("Fall");
  });

  it("usa o fuso: 31/12 22h em São Paulo ainda é dezembro mesmo sendo 01/01 em UTC", () => {
    const s = currentSeasonTag(new Date("2027-01-01T01:30:00Z"), "America/Sao_Paulo");
    expect(s).toMatchObject({ english: "Fall", year: 2026 });
  });
});
