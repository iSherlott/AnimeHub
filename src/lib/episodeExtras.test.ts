import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { extraEpisodes, upsertExtras } = await import("@/lib/episodeExtras");
const { validateExtraEdit } = await import("@/lib/extraEdit");

const ep = (number: string, titles: Array<[string, string]> = [], airDate: string | null = null) => ({ number, titles: titles.map(([language, title]) => ({ language, title })), airDate, length: null, rating: null, summary: null });

describe("extras do AniDB", () => {
  it("separa especiais, créditos, trailers, paródias e outros da sequência regular", () => {
    const extras = extraEpisodes({ episodes: [ep("1"), ep("S1", [["x-jat", "Tokubetsu"], ["en", "Special"], ["ja", "特別編"]], "2026-07-10"), ep("C2"), ep("T1"), ep("P1"), ep("O3"), ep("2")] } as never);
    expect(extras.map((e) => [e.code, e.kind, e.number])).toEqual([
      ["S1", "SPECIAL", 1],
      ["C2", "CREDIT", 2],
      ["T1", "TRAILER", 1],
      ["P1", "PARODY", 1],
      ["O3", "OTHER", 3],
    ]);
    expect(extras[0]).toMatchObject({ title: "Tokubetsu", titleEn: "Special", titleJa: "特別編", airDate: new Date("2026-07-10T00:00:00Z") });
    // Sem dia na fonte, fica sem dia — nunca um dia inventado.
    expect(extras[1].airDate).toBeNull();
  });

  it("código repetido vale uma vez; zeros à esquerda e minúsculas viram o mesmo código", () => {
    const extras = extraEpisodes({ episodes: [ep("s01"), ep("S1"), ep("c 1")] } as never);
    expect(extras.map((e) => e.code)).toEqual(["S1", "C1"]);
  });

  it("gravação respeita campo protegido e, no modo fill, só completa o que está vazio", async () => {
    const row = { id: "x1", code: "S1", title: "Velho", titleEn: null, titleJa: "手で直した", airDate: null, manualFields: ["titleJa"] };
    const updates: unknown[] = [];
    const db = { episodeExtra: { findMany: async () => [row], create: async () => undefined, update: async (args: unknown) => updates.push(args) } };
    const incoming = [{ code: "S1", kind: "SPECIAL" as const, number: 1, title: "Novo", titleEn: "New", titleJa: "AniDB", airDate: new Date("2026-07-10T00:00:00Z") }];
    await upsertExtras("c1", incoming, "fill", db as never);
    expect(updates).toEqual([{ where: { id: "x1" }, data: { titleEn: "New", airDate: new Date("2026-07-10T00:00:00Z") } }]);
    updates.length = 0;
    await upsertExtras("c1", incoming, "refresh", db as never);
    expect(updates).toEqual([{ where: { id: "x1" }, data: { title: "Novo", titleEn: "New", airDate: new Date("2026-07-10T00:00:00Z") } }]);
  });
});

describe("edição do extra", () => {
  const v = "2026-10-25T10:00:00.000Z";
  it("aceita título, sinopse e dia; recusa código, obra e data inválida", () => {
    expect(validateExtraEdit({ expectedUpdatedAt: v, changes: { title: "  Novo  ", airDate: "2026-07-10" } })).toMatchObject({ ok: true, value: { data: { title: "Novo", airDate: new Date("2026-07-10T00:00:00Z") }, protect: true } });
    expect(validateExtraEdit({ expectedUpdatedAt: v, changes: { code: "S2" } })).toMatchObject({ ok: false, errors: { code: "campo não editável" } });
    expect(validateExtraEdit({ expectedUpdatedAt: v, changes: { airDate: "2026-02-30" } })).toMatchObject({ ok: false, errors: { airDate: expect.any(String) } });
    expect(validateExtraEdit({ changes: { title: "x" } })).toMatchObject({ ok: false, errors: { expectedUpdatedAt: expect.any(String) } });
    expect(validateExtraEdit({ expectedUpdatedAt: v, changes: {} })).toMatchObject({ ok: false, errors: { changes: "nada para alterar" } });
  });
});
