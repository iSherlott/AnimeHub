import { describe, expect, it, vi } from "vitest";

const { upsertSource, upsertImage } = vi.hoisted(() => ({ upsertSource: vi.fn((args: unknown) => Promise.resolve(args)), upsertImage: vi.fn((args: unknown) => Promise.resolve(args)) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    episodeImageSource: { findMany: vi.fn(async () => [{ anilistId: 1, kitsuId: 51002, checkedAt: new Date() }, { anilistId: 2, kitsuId: 7, checkedAt: new Date() }]), upsert: upsertSource },
    catalogEntry: { findMany: vi.fn(async () => []) },
    anime: { findMany: vi.fn(async () => []) },
    episodeImage: { upsert: upsertImage },
  },
}));

import { syncTargets } from "./episodeImages";
import { KitsuHttpError } from "./kitsu";

describe("syncTargets: obra que a Kitsu não mostra mais", () => {
  it("o 404 desfaz o vínculo e não conta como falha; erro de verdade continua contando", async () => {
    const getThumbnail = vi.fn(async (kitsuId: number, episode: number) => {
      if (kitsuId === 51002) throw new KitsuHttpError(404, "Record not found");
      if (episode === 2) throw new KitsuHttpError(503, "busy");
      return "https://media.kitsu.app/episodes/thumbnails/1/original.jpg";
    });
    const now = new Date("2026-11-12T03:00:00Z");
    const result = await syncTargets(
      [
        { anilistId: 1, episodes: [5, 6] },
        { anilistId: 2, episodes: [1, 2] },
      ],
      { now, started: Date.now(), deps: { getKitsuId: vi.fn(), getThumbnail, sleep: async () => {} } }
    );
    expect(result).toMatchObject({ animes: 2, found: 1, failed: 1 });
    // Um pedido só para a obra escondida (para no primeiro 404) e o vínculo vira "sem Kitsu".
    expect(getThumbnail.mock.calls.filter(([id]) => id === 51002)).toHaveLength(1);
    expect(upsertSource).toHaveBeenCalledWith({ where: { anilistId: 1 }, create: { anilistId: 1, kitsuId: null }, update: { kitsuId: null, checkedAt: now } });
  });
});
