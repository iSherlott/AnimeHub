import { describe, it, expect } from "vitest";
import { computeRecommendedScore } from "@/lib/feedRanking";

describe("computeRecommendedScore", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("falls as a post ages, for a fixed like count", () => {
    const fresh = computeRecommendedScore(5, new Date(now.getTime() - 1 * 3_600_000), now);
    const older = computeRecommendedScore(5, new Date(now.getTime() - 10 * 3_600_000), now);
    expect(fresh).toBeGreaterThan(older);
  });

  it("rises with more likes, for a fixed age", () => {
    const createdAt = new Date(now.getTime() - 3 * 3_600_000);
    const fewLikes = computeRecommendedScore(1, createdAt, now);
    const manyLikes = computeRecommendedScore(50, createdAt, now);
    expect(manyLikes).toBeGreaterThan(fewLikes);
  });

  it("is never zero for an unliked post, so it still competes on recency", () => {
    expect(computeRecommendedScore(0, now, now)).toBeGreaterThan(0);
  });

  it("lets a heavily-liked older post outrank a fresh unliked one", () => {
    const heavilyLikedOld = computeRecommendedScore(200, new Date(now.getTime() - 24 * 3_600_000), now);
    const freshUnliked = computeRecommendedScore(0, new Date(now.getTime() - 5 * 60_000), now);
    expect(heavilyLikedOld).toBeGreaterThan(freshUnliked);
  });
});
