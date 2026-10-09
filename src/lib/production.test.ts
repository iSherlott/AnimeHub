import { describe, expect, it } from "vitest";
import type { AniListMedia } from "./anilist";
import { parseRelations, productionFieldsFromMedia } from "./production";

const media: AniListMedia = {
  id: 7,
  title: { romaji: "Kusuriya no Hitorigoto", english: "The Apothecary Diaries", native: "薬屋のひとりごと" },
  coverImage: { extraLarge: "http://img/c.jpg" },
  bannerImage: null,
  description: "Maomao...",
  episodes: 24,
  status: "RELEASING",
  season: "FALL",
  seasonYear: 2026,
  genres: ["Mystery", "Drama"],
  averageScore: 85,
  startDate: null,
  endDate: null,
  nextAiringEpisode: null,
  externalLinks: [{ site: "Official Site", url: "https://kusuriya.example" }],
};

describe("productionFieldsFromMedia", () => {
  it("maps the canonical fields and takes the season number from the franchise chain", () => {
    const f = productionFieldsFromMedia(media, { format: "TV", related: [] }, 2);
    expect(f).toMatchObject({
      anilistId: 7,
      seasonNumber: 2,
      format: "TV",
      titleNative: "薬屋のひとりごと",
      genres: "Mystery,Drama",
      officialSite: "https://kusuriya.example",
      relationsJson: null,
    });
  });

  it("serializes related media and tolerates missing relations", () => {
    const related = [{ id: 6, titleRomaji: "S1", format: "TV", relationType: "PREQUEL" }];
    expect(productionFieldsFromMedia(media, { format: "TV", related }, 1).relationsJson).toBe(JSON.stringify(related));
    expect(productionFieldsFromMedia(media, null, 1).format).toBeNull();
  });
});

describe("parseRelations", () => {
  it("returns [] for null, invalid JSON and non-arrays", () => {
    expect(parseRelations(null)).toEqual([]);
    expect(parseRelations("{nope")).toEqual([]);
    expect(parseRelations('{"a":1}')).toEqual([]);
  });
  it("parses a stored list", () => {
    expect(parseRelations('[{"id":1,"titleRomaji":"x","format":null,"relationType":"SEQUEL"}]')).toHaveLength(1);
  });
});
