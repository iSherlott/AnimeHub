import { describe, expect, it } from "vitest";
import type { AiringScheduleEntry } from "@prisma/client";
import { calendarItemFromCache, mergeConsecutiveEpisodes, type OwnedAnimeCalendarInfo } from "./calendarItem";

function entry(overrides: Partial<AiringScheduleEntry> & { airingAt?: Date; anilistId?: number } = {}): AiringScheduleEntry & { airingAt: Date; anilistId: number } {
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
  } as AiringScheduleEntry & { airingAt: Date; anilistId: number };
}

const owned: OwnedAnimeCalendarInfo = {
  id: "a1",
  titlePortuguese: "Diários",
  descriptionPortuguese: "Sinopse em português",
  isFavorite: true,
};

describe("calendarItemFromCache", () => {
  it("does not carry the synopsis: the preview fetches the work's own on open", () => {
    const item = calendarItemFromCache(entry(), new Map());
    expect(item.inMyList).toBe(false);
    expect(item).not.toHaveProperty("description");
    expect(item.descriptionPortuguese).toBeNull();
  });

  it("keeps the user's own Portuguese synopsis when the anime is in the list", () => {
    const item = calendarItemFromCache(entry(), new Map([[10, owned]]));
    expect(item.inMyList).toBe(true);
    expect(item.descriptionPortuguese).toBe("Sinopse em português");
  });

  it("splits genres and tolerates an empty list", () => {
    expect(calendarItemFromCache(entry(), new Map()).genres).toEqual(["Mystery", "Drama"]);
    expect(calendarItemFromCache(entry({ genres: "" }), new Map()).genres).toEqual([]);
  });
});

describe("mergeConsecutiveEpisodes", () => {
  const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00Z`);
  const item = (anilistId: number, episode: number, hhmm: string) => calendarItemFromCache(entry({ anilistId, episode, airingAt: at(hhmm) }), new Map());

  it("funde dois episódios em sequência num item só, com o horário estendido", () => {
    const merged = mergeConsecutiveEpisodes([item(1, 1, "13:00"), item(1, 2, "13:30")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ episode: 1, episodeEnd: 2, key: "1-1" });
    expect(merged[0].airingAt).toBe(at("13:00").toISOString());
    expect(merged[0].lastAiringAt).toBe(at("13:30").toISOString());
    expect(merged[0].endsAt).toBe(at("14:00").toISOString());
  });

  it("junta uma maratona de três episódios", () => {
    const merged = mergeConsecutiveEpisodes([item(1, 4, "20:00"), item(1, 5, "20:30"), item(1, 6, "21:00")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ episode: 4, episodeEnd: 6 });
    expect(merged[0].endsAt).toBe(at("21:30").toISOString());
  });

  it("não funde horários distantes nem obras diferentes, e mantém a ordem", () => {
    const list = [item(1, 1, "09:00"), item(2, 7, "09:30"), item(1, 2, "21:00"), item(2, 8, "10:00")];
    const merged = mergeConsecutiveEpisodes(list);
    expect(merged.map((m) => `${m.anilistId}:${m.episode}${m.episodeEnd ? `-${m.episodeEnd}` : ""}`)).toEqual(["1:1", "2:7-8", "1:2"]);
  });

  it("um episódio sozinho fica como está", () => {
    const [only] = mergeConsecutiveEpisodes([item(1, 3, "12:00")]);
    expect(only.episodeEnd).toBeUndefined();
    expect(only.endsAt).toBeUndefined();
  });
});
