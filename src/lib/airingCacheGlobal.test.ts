import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AniListAiringEntry } from "@/lib/anilist";

// Fases 4 e 5: a agenda grava o episódio global respeitando o que o admin corrigiu, registra a mudança de horário vinda
// da fonte e transforma "a fonte mudou depois do override" em conflito; o horário efetivo considera o override.
const db = vi.hoisted(() => ({
  schedule: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  catalog: { findMany: vi.fn() },
  override: { findFirst: vi.fn(), findMany: vi.fn() },
  conflict: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  changeLog: { createMany: vi.fn() },
  anime: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    airingScheduleEntry: db.schedule,
    catalogEntry: db.catalog,
    catalogOverride: db.override,
    catalogConflict: db.conflict,
    changeLog: db.changeLog,
    anime: db.anime,
    airingAlert: { upsert: vi.fn() },
  },
}));

const { cacheAiringSchedule, getCachedAiringSchedule, OVERRIDE_SOURCE } = await import("@/lib/airingCache");

const W = 4242;
const entry = (iso: string): AniListAiringEntry => ({ anilistId: W, episode: 3, airingAt: Math.floor(Date.parse(iso) / 1000), title: { romaji: "Obra", english: null, native: "作品" }, coverImage: null, bannerImage: null, genres: [], description: null });

beforeEach(() => {
  vi.clearAllMocks();
  db.catalog.findMany.mockResolvedValue([]);
  db.schedule.upsert.mockResolvedValue({});
  db.changeLog.createMany.mockResolvedValue({ count: 1 });
  db.anime.findMany.mockResolvedValue([]);
  db.override.findFirst.mockResolvedValue(null);
  db.override.findMany.mockResolvedValue([]);
  db.conflict.findFirst.mockResolvedValue(null);
});

describe("cacheAiringSchedule — episódio global", () => {
  it("data corrigida pelo admin não muda; o resto (títulos da obra) atualiza", async () => {
    db.schedule.findUnique.mockResolvedValueOnce({ id: "e3", airingAt: new Date("2026-10-20T10:00:00Z"), manualFields: ["airingAt", "status"] });
    await cacheAiringSchedule([entry("2026-10-20T12:00:00Z")]);
    const update = db.schedule.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("airingAt");
    expect(update).not.toHaveProperty("status");
    expect(update.titleRomaji).toBe("Obra");
    expect(db.changeLog.createMany).not.toHaveBeenCalled();
  });

  it("horário novo da fonte vira EXACT, reativa o episódio e fica no histórico (origem SOURCE)", async () => {
    db.schedule.findUnique.mockResolvedValueOnce({ id: "e3", airingAt: new Date("2026-10-20T10:00:00Z"), manualFields: [] });
    await cacheAiringSchedule([entry("2026-10-20T12:00:00Z")]);
    const update = db.schedule.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ airingAt: new Date("2026-10-20T12:00:00Z"), airDate: null, dateCertainty: "EXACT", status: "ACTIVE" });
    expect(db.changeLog.createMany.mock.calls[0][0].data[0]).toMatchObject({ origin: "SOURCE", entity: "AiringScheduleEntry", entityId: "e3", field: "airingAt" });
  });

  it("a fonte mudou depois do override: abre um conflito (uma vez) e não mexe no override", async () => {
    db.schedule.findUnique.mockResolvedValueOnce({ id: "e3", airingAt: new Date("2026-10-20T10:00:00Z"), manualFields: [] });
    db.override.findFirst.mockResolvedValueOnce({ id: "o1", value: new Date("2026-10-20T11:00:00Z"), originalValue: new Date("2026-10-20T10:00:00Z"), reason: "atraso", adminName: "Admin" });
    await cacheAiringSchedule([entry("2026-10-20T12:00:00Z")]);
    expect(db.conflict.create).toHaveBeenCalledTimes(1);
    expect(db.conflict.create.mock.calls[0][0].data).toMatchObject({ anilistId: W, episode: 3, aSource: "AniList", aValue: new Date("2026-10-20T12:00:00Z"), bSource: OVERRIDE_SOURCE, bValue: new Date("2026-10-20T11:00:00Z") });
  });

  it("com conflito já pendente, só atualiza o valor novo da fonte", async () => {
    db.schedule.findUnique.mockResolvedValueOnce({ id: "e3", airingAt: new Date("2026-10-20T12:00:00Z"), manualFields: [] });
    db.override.findFirst.mockResolvedValueOnce({ id: "o1", value: new Date("2026-10-20T11:00:00Z"), originalValue: new Date("2026-10-20T10:00:00Z"), reason: "", adminName: "Admin" });
    db.conflict.findFirst.mockResolvedValueOnce({ id: "c1", bSource: OVERRIDE_SOURCE, aValue: new Date("2026-10-20T12:00:00Z") });
    await cacheAiringSchedule([entry("2026-10-20T13:00:00Z")]);
    expect(db.conflict.create).not.toHaveBeenCalled();
    expect(db.conflict.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { aValue: new Date("2026-10-20T13:00:00Z") } });
  });
});

describe("getCachedAiringSchedule — horário efetivo", () => {
  it("o override traz para o período um episódio que a fonte põe fora, e tira um que ela põe dentro", async () => {
    const from = new Date("2026-10-20T00:00:00Z");
    const to = new Date("2026-10-27T00:00:00Z");
    db.override.findMany
      .mockResolvedValueOnce([{ anilistId: W, episode: 9 }]) // overrides com valor no período
      .mockResolvedValueOnce([
        { anilistId: W, episode: 9, value: new Date("2026-10-21T10:00:00Z") },
        { anilistId: W, episode: 1, value: new Date("2026-11-30T10:00:00Z") },
      ]);
    db.schedule.findMany.mockResolvedValueOnce([
      { anilistId: W, episode: 1, airingAt: new Date("2026-10-22T10:00:00Z"), status: "ACTIVE" },
      { anilistId: W, episode: 9, airingAt: new Date("2026-12-01T10:00:00Z"), status: "ACTIVE" },
      { anilistId: W, episode: 2, airingAt: new Date("2026-10-23T10:00:00Z"), status: "ACTIVE" },
    ]);
    const rows = await getCachedAiringSchedule(from, to);
    expect(rows.map((r) => [r.episode, r.airingAt.toISOString()])).toEqual([
      [9, "2026-10-21T10:00:00.000Z"],
      [2, "2026-10-23T10:00:00.000Z"],
    ]);
  });
});
