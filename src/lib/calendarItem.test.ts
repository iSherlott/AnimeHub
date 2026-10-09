import { describe, expect, it } from "vitest";
import type { AiringScheduleEntry } from "@prisma/client";
import { calendarItemFromCache, type OwnedAnimeCalendarInfo } from "./calendarItem";

function entry(overrides: Partial<AiringScheduleEntry> = {}): AiringScheduleEntry {
  return {
    id: "e1",
    anilistId: 10,
    episode: 3,
    airingAt: new Date("2026-10-10T16:00:00Z"),
    titleRomaji: "Kusuriya no Hitorigoto",
    titleEnglish: "The Apothecary Diaries",
    titleNative: "薬屋のひとりごと",
    coverImage: null,
    bannerImage: null,
    genres: "Mystery,Drama",
    description: "Sinopse do cache",
    fetchedAt: new Date(),
    ...overrides,
  } as AiringScheduleEntry;
}

const owned: OwnedAnimeCalendarInfo = {
  id: "a1",
  titlePortuguese: "Diários",
  description: "Sinopse da lista",
  descriptionPortuguese: "Sinopse em português",
  isFavorite: true,
};

describe("calendarItemFromCache", () => {
  it("uses the cached description for anime outside the user's list (Epic 29)", () => {
    const item = calendarItemFromCache(entry(), new Map());
    expect(item.inMyList).toBe(false);
    expect(item.description).toBe("Sinopse do cache");
    expect(item.descriptionPortuguese).toBeNull();
  });

  it("prefers the user's own description over the cache when the anime is in the list", () => {
    const item = calendarItemFromCache(entry(), new Map([[10, owned]]));
    expect(item.inMyList).toBe(true);
    expect(item.description).toBe("Sinopse da lista");
    expect(item.descriptionPortuguese).toBe("Sinopse em português");
  });

  it("falls back to the cache when the owned row has no description", () => {
    const item = calendarItemFromCache(entry(), new Map([[10, { ...owned, description: null }]]));
    expect(item.description).toBe("Sinopse do cache");
  });

  it("returns null when neither source has a description", () => {
    expect(calendarItemFromCache(entry({ description: null }), new Map()).description).toBeNull();
  });

  it("splits genres and tolerates an empty list", () => {
    expect(calendarItemFromCache(entry(), new Map()).genres).toEqual(["Mystery", "Drama"]);
    expect(calendarItemFromCache(entry({ genres: "" }), new Map()).genres).toEqual([]);
  });
});
