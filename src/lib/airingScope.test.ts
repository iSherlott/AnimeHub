import { describe, expect, it } from "vitest";
import type { AniListAiringEntry } from "@/lib/anilist";
import { filterToScope } from "@/lib/airingScope";

const entry = (anilistId: number, episode = 1): AniListAiringEntry => ({
  anilistId,
  episode,
  airingAt: 1_790_000_000,
  title: { romaji: `Obra ${anilistId}`, english: null, native: null },
  coverImage: null,
  bannerImage: null,
  genres: [],
  description: null,
});

describe("filterToScope", () => {
  it("mantém só os episódios de obras do escopo e conta o que ficou de fora", () => {
    const fetched = [entry(1, 1), entry(1, 2), entry(2, 1), entry(3, 4)];
    const { kept, skipped } = filterToScope(fetched, new Set([1, 3]));
    expect(kept.map((e) => `${e.anilistId}-${e.episode}`)).toEqual(["1-1", "1-2", "3-4"]);
    expect(skipped).toBe(1);
  });

  it("escopo vazio não deixa nada passar", () => {
    expect(filterToScope([entry(1)], new Set())).toEqual({ kept: [], skipped: 1 });
  });
});
