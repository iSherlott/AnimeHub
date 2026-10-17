import { describe, expect, it } from "vitest";
import { deriveSeriesInfo } from "./series";

describe("deriveSeriesInfo", () => {
  it("entende as marcas de temporada em inglês", () => {
    expect(deriveSeriesInfo("Jujutsu Kaisen 2nd Season")).toEqual({ seriesKey: "jujutsu kaisen", seasonNumber: 2 });
    expect(deriveSeriesInfo("Jujutsu Kaisen Season 3")).toEqual({ seriesKey: "jujutsu kaisen", seasonNumber: 3 });
    expect(deriveSeriesInfo("Overlord Second Season")).toEqual({ seriesKey: "overlord", seasonNumber: 2 });
    expect(deriveSeriesInfo("Overlord III")).toEqual({ seriesKey: "overlord", seasonNumber: 3 });
  });

  it("entende 'Dai Ni Maku' (AniDB) e '第二期' como a temporada 2", () => {
    expect(deriveSeriesInfo("Tsuki ga Michibiku Isekai Douchuu Dai Ni Maku")).toEqual({ seriesKey: "tsuki ga michibiku isekai douchuu", seasonNumber: 2 });
    expect(deriveSeriesInfo("Mushoku Tensei Dai San Shou")).toEqual({ seriesKey: "mushoku tensei", seasonNumber: 3 });
    expect(deriveSeriesInfo("月が導く異世界道中 第二期")).toEqual({ seriesKey: "月が導く異世界道中", seasonNumber: 2 });
  });

  it("sem marca de temporada é a 1ª", () => {
    expect(deriveSeriesInfo("Kaguya-sama wa Kokurasetai")).toEqual({ seriesKey: "kaguya-sama wa kokurasetai", seasonNumber: 1 });
  });
});
