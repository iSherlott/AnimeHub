import { describe, expect, it } from "vitest";
import { aggregateEpisodes } from "./episodeReactions";

describe("curva da temporada (reações e notas por episódio)", () => {
  it("soma reações e notas por episódio, com a média em uma casa e os emojis mais usados", () => {
    const stats = aggregateEpisodes([
      { episode: 2, emoji: "🔥", rating: 5 },
      { episode: 2, emoji: "🔥", rating: 4 },
      { episode: 2, emoji: "😭", rating: null },
      { episode: 1, emoji: null, rating: 3 },
    ]);
    expect(stats).toEqual([
      { episode: 1, reactions: 0, ratings: 1, avgRating: 3, topEmojis: [] },
      { episode: 2, reactions: 3, ratings: 2, avgRating: 4.5, topEmojis: [{ emoji: "🔥", count: 2 }, { emoji: "😭", count: 1 }] },
    ]);
  });

  it("registro só com diário não entra na curva", () => {
    expect(aggregateEpisodes([{ episode: 1, emoji: null, rating: null }])).toEqual([]);
  });
});
