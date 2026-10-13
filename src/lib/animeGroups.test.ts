import { describe, expect, it } from "vitest";
import { groupKeysFor, type GroupableAnime, type SeasonInfo } from "@/lib/animeGroups";
import { groupCategory } from "@/lib/profileAnimeList";

const row = (anilistId: number, seriesKey: string | null, seasonNumber: number, titleRomaji = `T${anilistId}`): GroupableAnime => ({ anilistId, seriesKey, seasonNumber, titleRomaji });

describe("groupKeysFor", () => {
  it("temporadas da mesma franquia caem na mesma obra", () => {
    const info = new Map<number, SeasonInfo>([[1, { franchiseId: "F", seasonNumber: 1 }], [2, { franchiseId: "F", seasonNumber: 2 }], [3, { franchiseId: "G", seasonNumber: 1 }]]);
    const keys = groupKeysFor([row(1, "a", 1), row(2, "a 2", 2), row(3, "b", 1)], info);
    expect(keys.get(1)).toBe(keys.get(2));
    expect(keys.get(1)).not.toBe(keys.get(3));
  });
  it("sem franquia, o título-base junta as temporadas", () => {
    const keys = groupKeysFor([row(1, "hell mode", 1), row(2, "hell mode", 2), row(3, "outro", 1)], new Map());
    expect(keys.get(1)).toBe("s:hell mode");
    expect(keys.get(2)).toBe("s:hell mode");
    expect(keys.get(3)).toBe("s:outro");
  });
  it("uma temporada com franquia e outra só com título (mesmo título-base) viram uma obra", () => {
    const info = new Map<number, SeasonInfo>([[1, { franchiseId: "F", seasonNumber: 1 }]]);
    const keys = groupKeysFor([row(1, "obra", 1), row(2, "obra", 2)], info);
    expect(keys.get(2)).toBe(keys.get(1));
    expect(keys.get(1)).toBe("f:F");
  });
  it("sem título-base usa o título completo", () => {
    expect(groupKeysFor([row(1, null, 1, "  Solto  ")], new Map()).get(1)).toBe("s:solto");
  });
});

describe("groupCategory", () => {
  it("o que acontece agora pesa mais: acompanhando, não terminei, dropado, terminei", () => {
    expect(groupCategory(["finished", "watching"])).toBe("watching");
    expect(groupCategory(["finished", "unfinished", "dropped"])).toBe("unfinished");
    expect(groupCategory(["finished", "dropped"])).toBe("dropped");
    expect(groupCategory(["finished", "finished"])).toBe("finished");
    expect(groupCategory(["other"])).toBe("other");
  });
});
