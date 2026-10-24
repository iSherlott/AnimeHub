import { describe, expect, it, vi } from "vitest";
import type { AniListAiringEntry } from "@/lib/anilist";

const { upsert, findUnique, findMany, deleteMany, catalogFindMany } = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({})),
  findUnique: vi.fn(async () => null),
  findMany: vi.fn(async (): Promise<unknown[]> => []),
  deleteMany: vi.fn(async () => ({ count: 0 })),
  catalogFindMany: vi.fn(async (): Promise<unknown[]> => []),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { airingScheduleEntry: { upsert, findUnique, findMany, deleteMany }, catalogEntry: { findMany: catalogFindMany } },
}));

const { cacheAiringSchedule, pruneMissingFutureEntries } = await import("@/lib/airingCache");

const GOBLIN = 209219;
const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const entry = (anilistId: number, episode: number, iso: string): AniListAiringEntry => ({
  anilistId,
  episode,
  airingAt: at(iso),
  title: { romaji: `Obra ${anilistId}`, english: null, native: null },
  coverImage: null,
  bannerImage: null,
  genres: [],
  description: null,
});

describe("agenda com atraso do streaming (Epic 50)", () => {
  it("grava o horário do streaming: TV japonesa + atraso da obra; quem não tem atraso fica igual", async () => {
    upsert.mockClear();
    catalogFindMany.mockResolvedValueOnce([{ anilistId: GOBLIN, streamingDelayMinutes: 120, streamingSite: "Crunchyroll" }]);
    await cacheAiringSchedule([entry(GOBLIN, 4, "2026-10-19T13:00:00Z"), entry(1, 1, "2026-10-19T13:00:00Z")]);
    const saved = (upsert.mock.calls as unknown as Array<[{ create: { anilistId: number; airingAt: Date } }]>).map((c) => [c[0].create.anilistId, c[0].create.airingAt.toISOString()]);
    expect(saved).toEqual([
      [GOBLIN, "2026-10-19T15:00:00.000Z"],
      [1, "2026-10-19T13:00:00.000Z"],
    ]);
  });

  it("não apaga o episódio que já passou na TV mas ainda vai sair no streaming", async () => {
    deleteMany.mockClear();
    const now = new Date("2026-10-19T14:00:00Z"); // depois da TV (13:00), antes do streaming (15:00)
    findMany.mockResolvedValueOnce([
      { id: "goblin-4", anilistId: GOBLIN, episode: 4, airingAt: new Date("2026-10-19T15:00:00Z") },
      { id: "sumiu", anilistId: 2, episode: 1, airingAt: new Date("2026-10-19T16:00:00Z") },
    ]);
    catalogFindMany.mockResolvedValueOnce([{ anilistId: GOBLIN, streamingDelayMinutes: 120, streamingSite: "Crunchyroll" }]);
    // A AniList lê a janela a partir de agora: o episódio 4 (13:00 na TV) não vem mais; a obra 2 sumiu de verdade.
    await pruneMissingFutureEntries([], now, new Date("2026-10-26T00:00:00Z"), now);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sumiu"] } } });
  });
});
