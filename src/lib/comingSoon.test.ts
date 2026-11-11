import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { comingSoonItems, countsForComingSoon, type FollowedRow } from "./comingSoon";

const current = { season: "FALL", year: 2026 } as const;
const row = (over: Partial<FollowedRow> = {}): FollowedRow => ({ watchState: null, isFavorite: false, waiting: false, status: null, season: null, seasonYear: null, ...over });

describe("Em breve: quais obras da lista contam", () => {
  it("assistida (assistindo, não terminei, terminei) ou favorita; dropada nunca", () => {
    expect(countsForComingSoon(row({ watchState: "FINISHED" }), false, current)).toBe(true);
    expect(countsForComingSoon(row({ watchState: "UNFINISHED" }), false, current)).toBe(true);
    expect(countsForComingSoon(row({ status: "FINISHED" }), false, current)).toBe(true);
    expect(countsForComingSoon(row({ isFavorite: true, status: "NOT_YET_RELEASED", season: "WINTER", seasonYear: 2027 }), false, current)).toBe(true);
    expect(countsForComingSoon(row({ watchState: "DROPPED", isFavorite: true }), false, current)).toBe(false);
    // Só guardada na lista, sem ter começado (ainda por estrear em outra temporada, ou sem nada que diga que viu).
    expect(countsForComingSoon(row({ status: "NOT_YET_RELEASED", season: "WINTER", seasonYear: 2027 }), false, current)).toBe(false);
    expect(countsForComingSoon(row(), false, current)).toBe(false);
    expect(countsForComingSoon(row(), true, current)).toBe(true);
  });
});

describe("Em breve: a lista", () => {
  const entry = (anilistId: number, status: string, startDate: string | null, relations: unknown[], title = `Obra ${anilistId}`) => ({
    anilistId,
    titleRomaji: title,
    coverImage: null,
    format: "TV",
    status,
    startDate: startDate ? new Date(startDate) : null,
    season: null,
    seasonYear: null,
    relationsJson: JSON.stringify(relations),
  });
  it("só continuação/filme das obras que contam; no ar primeiro, depois a estreia mais próxima e a sem data no fim", () => {
    const followed = new Map([[1, "Original"], [2, "Outra"]]);
    const items = comingSoonItems(followed, new Set([1, 2, 13]), [
      entry(10, "NOT_YET_RELEASED", null, [{ id: 1, relationType: "PREQUEL" }]),
      entry(11, "NOT_YET_RELEASED", "2027-04-01", [{ id: 2, relationType: "PARENT" }]),
      entry(12, "NOT_YET_RELEASED", "2027-01-10", [{ id: 1, relationType: "PREQUEL" }]),
      entry(13, "RELEASING", "2026-10-05", [{ id: 1, relationType: "PREQUEL" }]),
      entry(14, "NOT_YET_RELEASED", "2027-01-01", [{ id: 1, relationType: "SEQUEL" }]),
      entry(15, "NOT_YET_RELEASED", "2027-01-01", [{ id: 99, relationType: "PREQUEL" }]),
      entry(16, "FINISHED", "2026-10-01", [{ id: 1, relationType: "PREQUEL" }]),
    ]);
    expect(items.map((i) => i.key)).toEqual(["13", "12", "11", "10"]);
    expect(items[0]).toMatchObject({ relation: "PREQUEL", relatedKey: "1", relatedTitle: "Original", inList: true });
    expect(items[2]).toMatchObject({ relation: "PARENT", relatedTitle: "Outra", inList: false });
  });
});
