import { describe, expect, it, vi } from "vitest";
import type { AniListMedia } from "@/lib/anilist";

const { upsert, findMany } = vi.hoisted(() => ({ upsert: vi.fn(async () => ({})), findMany: vi.fn(async () => []) }));
vi.mock("@/lib/prisma", () => ({ prisma: { catalogEntry: { upsert, findMany } } }));

const { cacheAniListMedia, getCachedSeason, searchCachedCatalog, getTopRanked } = await import("@/lib/catalogCache");

const media = (id: number, genres: string[]): AniListMedia => ({
  id,
  idMal: null,
  title: { romaji: `Obra ${id}`, english: null, native: null },
  coverImage: { extraLarge: null },
  bannerImage: null,
  description: null,
  episodes: 12,
  status: "RELEASING",
  season: "FALL",
  seasonYear: 2026,
  genres,
  averageScore: null,
  startDate: null,
  endDate: null,
  nextAiringEpisode: null,
  externalLinks: [],
});

describe("cacheAniListMedia", () => {
  it("guarda como cache fora da plataforma: onPlatform false só na criação, sem mexer no que já está na plataforma", async () => {
    upsert.mockClear();
    await cacheAniListMedia([media(1, ["Comedy"])]);
    const call = upsert.mock.calls[0] as unknown as [{ create: { onPlatform: boolean }; update: Record<string, unknown> }];
    expect(call[0].create.onPlatform).toBe(false);
    expect("onPlatform" in call[0].update).toBe(false);
  });

  it("obra sem temporada na AniList (ONA) não apaga a temporada que já estava guardada", async () => {
    upsert.mockClear();
    await cacheAniListMedia([{ ...media(1, ["Comedy"]), season: null, seasonYear: null }, media(2, ["Comedy"])]);
    const calls = upsert.mock.calls as unknown as Array<[{ where: { anilistId: number }; update: Record<string, unknown> }]>;
    const sem = calls.find((c) => c[0].where.anilistId === 1)?.[0].update as Record<string, unknown>;
    const com = calls.find((c) => c[0].where.anilistId === 2)?.[0].update as Record<string, unknown>;
    expect("season" in sem).toBe(false);
    expect("seasonYear" in sem).toBe(false);
    expect(com).toMatchObject({ season: "FALL", seasonYear: 2026 });
  });

  it("nunca guarda conteúdo adulto (hentai)", async () => {
    upsert.mockClear();
    await cacheAniListMedia([media(1, ["Comedy"]), media(2, ["Hentai", "Comedy"]), media(3, ["Romance"])]);
    const ids = (upsert.mock.calls as unknown as Array<[{ where: { anilistId: number } }]>).map((c) => c[0].where.anilistId);
    expect(ids.sort()).toEqual([1, 3]);
  });
});

describe("leituras do catálogo", () => {
  it("temporada, busca e ranking só olham obras da plataforma, sem completar com outras temporadas", async () => {
    findMany.mockClear();
    await getCachedSeason("FALL", 2026);
    await searchCachedCatalog("naruto");
    await getTopRanked(5);
    const wheres = (findMany.mock.calls as unknown as Array<[{ where?: Record<string, unknown> }]>).map((c) => c[0]?.where);
    expect(wheres).toHaveLength(3);
    for (const where of wheres) expect(where).toMatchObject({ onPlatform: true });
    expect(wheres[0]).toMatchObject({ season: "FALL", seasonYear: 2026 });
  });
});
