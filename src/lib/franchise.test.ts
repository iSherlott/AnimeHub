import { describe, expect, it } from "vitest";
import { resolveFranchise, type MediaRelations } from "./franchise";

function graph(items: MediaRelations[]) {
  const byId = new Map(items.map((m) => [m.id, m]));
  return async (id: number) => byId.get(id) ?? null;
}

const m = (id: number, titleRomaji: string, format: string | null, predecessorIds: number[] = []): MediaRelations => ({
  id,
  titleRomaji,
  format,
  predecessorIds,
});

describe("resolveFranchise", () => {
  it("puts 'Final Season' in the franchise of the first season (the case the title regex got wrong)", async () => {
    const fetch = graph([
      m(1, "Shingeki no Kyojin", "TV"),
      m(2, "Shingeki no Kyojin Season 2", "TV", [1]),
      m(3, "Shingeki no Kyojin Season 3", "TV", [2]),
      m(4, "Shingeki no Kyojin: The Final Season", "TV", [3]),
    ]);
    const result = await resolveFranchise(4, fetch);
    expect(result.rootId).toBe(1);
    expect(result.chainIds).toEqual([1, 2, 3, 4]);
    expect(result.seasonNumber).toBe(4);
  });

  it("returns the media itself as root and season 1 when it has no predecessor", async () => {
    const result = await resolveFranchise(1, graph([m(1, "Frieren", "TV")]));
    expect(result).toMatchObject({ rootId: 1, seasonNumber: 1, chainIds: [1] });
  });

  it("does not count movies/OVAs as seasons but keeps them in the franchise", async () => {
    const fetch = graph([
      m(1, "Show", "TV"),
      m(2, "Show Movie", "MOVIE", [1]),
      m(3, "Show 2", "TV", [2]),
    ]);
    const result = await resolveFranchise(3, fetch);
    expect(result.rootId).toBe(1);
    expect(result.seasonNumber).toBe(2);
  });

  it("survives cycles in the relation graph", async () => {
    const fetch = graph([m(1, "A", "TV", [2]), m(2, "B", "TV", [1])]);
    const result = await resolveFranchise(1, fetch);
    expect(result.chainIds.length).toBe(2);
  });

  it("falls back to a self-franchise when the media cannot be fetched", async () => {
    const result = await resolveFranchise(99, async () => null);
    expect(result).toMatchObject({ rootId: 99, seasonNumber: 1 });
  });

  it("stops the chain when a predecessor cannot be fetched", async () => {
    const fetch = graph([m(2, "S2", "TV", [1])]);
    const result = await resolveFranchise(2, fetch);
    expect(result.rootId).toBe(2);
    expect(result.seasonNumber).toBe(1);
  });
});
