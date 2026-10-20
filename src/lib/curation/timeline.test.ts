import { describe, expect, it } from "vitest";
import { buildTimeline, specialsSummary, type TimelineNode } from "./timeline";

const node = (anilistId: number, kind: string, startDate: string, relations: TimelineNode["relations"] = [], over: Partial<TimelineNode> = {}): TimelineNode => ({
  anilistId,
  titleRomaji: `Obra ${anilistId}`,
  titleEnglish: null,
  titleNative: null,
  kind,
  format: kind === "EPISODE" ? "TV" : kind,
  season: null,
  seasonYear: null,
  startDate,
  episodes: 12,
  coverImage: null,
  relations,
  ...over,
});

const map = (...nodes: TimelineNode[]) => new Map(nodes.map((n) => [n.anilistId, n]));

// Naruto (1) → Shippuuden (2, mudou de nome) → Boruto (3, spin-off); OVA (10) e filme (11) da primeira; ODA (12) da segunda.
const franchise = map(
  node(1, "EPISODE", "2002-10-03", [{ id: 2, relationType: "SEQUEL" }, { id: 10, relationType: "SIDE_STORY" }, { id: 11, relationType: "SUMMARY" }]),
  node(2, "EPISODE", "2007-02-15", [{ id: 1, relationType: "PREQUEL" }, { id: 3, relationType: "SPIN_OFF" }, { id: 12, relationType: "SIDE_STORY" }], { titleRomaji: "Shippuuden" }),
  node(3, "EPISODE", "2017-04-05", [{ id: 2, relationType: "PARENT" }]),
  node(10, "OVA", "2004-08-01", [{ id: 1, relationType: "PARENT" }]),
  node(11, "MOVIE", "2004-08-21", [{ id: 1, relationType: "PARENT" }]),
  node(12, "ODA", "2009-03-01", [{ id: 2, relationType: "PARENT" }])
);

describe("buildTimeline", () => {
  it("a linha principal tem as temporadas em ordem, mesmo com nome diferente", () => {
    const t = buildTimeline(1, franchise)!;
    expect(t.main.map((m) => [m.anilistId, m.seasonNumber, m.titleRomaji])).toEqual([
      [1, 1, "Obra 1"],
      [2, 2, "Shippuuden"],
    ]);
    expect(t.main.find((m) => m.anilistId === 1)?.current).toBe(true);
  });

  it("OVA, ODA e filme são especiais, fora da linha obrigatória, por data", () => {
    const t = buildTimeline(1, franchise)!;
    expect(t.specials.map((s) => [s.anilistId, s.kind])).toEqual([
      [10, "OVA"],
      [11, "MOVIE"],
      [12, "ODA"],
    ]);
    expect(t.main.some((m) => m.kind !== "EPISODE")).toBe(false);
  });

  it("spin-off de série fica em 'relacionadas', não na linha principal", () => {
    const t = buildTimeline(1, franchise)!;
    expect(t.related.map((r) => [r.anilistId, r.relationType])).toEqual([[3, "SPIN_OFF"]]);
  });

  it("vista de um OVA, ancora na série e marca o OVA como atual", () => {
    const t = buildTimeline(10, franchise)!;
    expect(t.main.map((m) => m.anilistId)).toEqual([1, 2]);
    expect(t.specials.find((s) => s.anilistId === 10)?.current).toBe(true);
  });

  it("obras que não estão no catálogo são ignoradas", () => {
    const only = map(node(1, "EPISODE", "2002-10-03", [{ id: 99, relationType: "SEQUEL" }]));
    const t = buildTimeline(1, only)!;
    expect(t.main).toHaveLength(1);
    expect(t.specials).toEqual([]);
  });

  it("raiz fora do catálogo não tem linha do tempo", () => {
    expect(buildTimeline(5, franchise)).toBeNull();
  });

  it("relações em ciclo não travam", () => {
    const loop = map(
      node(1, "EPISODE", "2000-01-01", [{ id: 2, relationType: "SEQUEL" }]),
      node(2, "EPISODE", "2001-01-01", [{ id: 1, relationType: "SEQUEL" }])
    );
    expect(buildTimeline(1, loop)!.main).toHaveLength(2);
  });

  it("sem data de estreia, ordena pela temporada e depois pelo id", () => {
    const m = map(
      node(2, "EPISODE", "", [{ id: 1, relationType: "PREQUEL" }], { startDate: null, season: "FALL", seasonYear: 2010 }),
      node(1, "EPISODE", "", [{ id: 2, relationType: "SEQUEL" }], { startDate: null, season: "SPRING", seasonYear: 2010 })
    );
    expect(buildTimeline(2, m)!.main.map((x) => x.anilistId)).toEqual([1, 2]);
  });
});

describe("specialsSummary", () => {
  it("conta por tipo, na ordem OVA, ODA, filme", () => {
    expect(specialsSummary([{ kind: "MOVIE" }, { kind: "OVA" }, { kind: "OVA" }, { kind: "ODA" }])).toEqual([
      { kind: "OVA", count: 2 },
      { kind: "ODA", count: 1 },
      { kind: "MOVIE", count: 1 },
    ]);
  });
});
