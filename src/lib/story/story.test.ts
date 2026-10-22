import { describe, expect, it } from "vitest";
import { findRebootCandidates, type CandidateEntry } from "./candidates";
import { validateLoot } from "./loot";
import { storyMarkersOf } from "./markers";
import { arcName, arcOf, excludedEdges, groupByArcs, linkKey, type ArcInfo } from "./versions";
import type { StoryRelation } from "./context";
import { placeFranchises, type OrderNode } from "@/lib/curation/franchiseOrder";
import { buildTimeline, type TimelineNode } from "@/lib/curation/timeline";

const arcs: ArcInfo[] = [
  { position: 1, nameEn: "Hunter Exam", namePt: "Exame Hunter", nameJa: null, startEpisode: 1, endEpisode: 2 },
  { position: 2, nameEn: "Chimera Ant", namePt: null, nameJa: "キメラアント編", startEpisode: 3, endEpisode: 5 },
];

describe("arcos", () => {
  it("acha o arco do episódio e escolhe o nome pelo idioma, caindo para o inglês", () => {
    expect(arcOf(2, arcs)?.position).toBe(1);
    expect(arcOf(3, arcs)?.position).toBe(2);
    expect(arcOf(9, arcs)).toBeNull();
    expect(arcName(arcs[0], "pt")).toBe("Exame Hunter");
    expect(arcName(arcs[1], "pt")).toBe("Chimera Ant");
    expect(arcName(arcs[1], "ja")).toBe("キメラアント編");
    expect(arcName(arcs[0], "ja")).toBe("Hunter Exam");
  });

  it("põe um cabeçalho antes do primeiro episódio de cada arco e o ponto em que o reboot vai além, antes do arco", () => {
    const items = [1, 2, 3, 4, 5, 6].map((number) => ({ number }));
    const out = groupByArcs(items, (i) => i, arcs, 3).map((e) => (e.kind === "item" ? `ep${e.item.number}` : e.kind === "arc" ? `arc${e.arc.position}` : `beyond${e.fromEpisode}`));
    expect(out).toEqual(["arc1", "ep1", "ep2", "beyond3", "arc2", "ep3", "ep4", "ep5", "ep6"]);
  });

  it("itens que não são episódios (ramificações) ficam como estão, sem cabeçalho", () => {
    const items: Array<{ number: number } | { branch: true }> = [{ number: 1 }, { branch: true }, { number: 2 }];
    const out = groupByArcs(items, (i) => ("number" in i ? i : null), arcs, null);
    expect(out.map((e) => e.kind)).toEqual(["arc", "item", "item", "item"]);
  });
});

describe("candidatos a reboot", () => {
  const entry = (anilistId: number, year: number, rank: number | null, relations: CandidateEntry["relations"], kind = "EPISODE"): CandidateEntry => ({ anilistId, titleRomaji: `T${anilistId}`, kind, seasonYear: year, episodes: 12, popularityRank: rank, relations });
  it("lista pares de séries ligados como versão alternativa, do mais popular ao menos, com a versão mais antiga primeiro", () => {
    const entries = [
      entry(1, 2011, 5, [{ id: 2, relationType: "ALTERNATIVE" }]),
      entry(2, 1999, 5, [{ id: 1, relationType: "ALTERNATIVE" }]),
      entry(3, 2004, 1, [{ id: 4, relationType: "ALTERNATIVE" }]),
      entry(4, 2021, null, [{ id: 3, relationType: "ALTERNATIVE" }]),
      entry(5, 2000, 2, [{ id: 6, relationType: "SEQUEL" }]),
      entry(6, 2001, 3, []),
      entry(7, 2010, 4, [{ id: 8, relationType: "ALTERNATIVE" }]),
      entry(8, 2012, 4, [], "MOVIE"),
    ];
    const list = findRebootCandidates(entries, new Set());
    expect(list.map((c) => [c.a.anilistId, c.b.anilistId])).toEqual([[3, 4], [2, 1]]);
  });

  it("não repete o par já pesquisado", () => {
    const entries = [entry(1, 2011, 5, [{ id: 2, relationType: "ALTERNATIVE" }]), entry(2, 1999, 5, [])];
    expect(findRebootCandidates(entries, new Set([linkKey(2, 1)]))).toEqual([]);
  });
});

describe("validateLoot", () => {
  const known = new Map([[1, { episodes: 62 }], [2, { episodes: 148 }], [3, { episodes: null }]]);
  const base = { loot: "reboots-001", items: [{ a: 1, b: 2, verdict: "REBOOT", reboot: { old: 1, new: 2, coverage: "PARTIAL", beyondFromEpisode: 76 }, arcs: [{ anilistId: 2, list: [{ nameEn: "Hunter Exam", start: 1, end: 26 }, { nameEn: "Chimera Ant", start: 76, end: 136 }] }] }] };

  it("aceita um lote certo", () => {
    expect(validateLoot(base, known).ok).toBe(true);
    expect(validateLoot({ loot: "reboots-002", items: [{ a: 1, b: 3, verdict: "NOT_REBOOT", note: "universos parecidos" }] }, known).ok).toBe(true);
  });

  const errorsOf = (input: unknown) => {
    const r = validateLoot(input, known);
    return r.ok ? [] : r.errors;
  };

  it("recusa nome de lote inválido, lote vazio e obra fora do catálogo", () => {
    expect(errorsOf({ loot: "X", items: base.items }).join()).toMatch(/dê um nome/);
    expect(errorsOf({ loot: "reboots-001", items: [] }).join()).toMatch(/ao menos um par/);
    expect(errorsOf({ loot: "reboots-001", items: [{ a: 1, b: 99, verdict: "NOT_REBOOT" }] }).join()).toMatch(/obra 99 não está no catálogo/);
  });

  it("um REBOOT precisa de reboot, com as duas obras do par e o episódio em que vai além (dentro dos episódios)", () => {
    const item = (reboot: unknown) => ({ loot: "reboots-001", items: [{ a: 1, b: 2, verdict: "REBOOT", reboot }] });
    expect(errorsOf({ loot: "reboots-001", items: [{ a: 1, b: 2, verdict: "REBOOT" }] }).join()).toMatch(/precisa de reboot/);
    expect(errorsOf(item({ old: 1, new: 7, coverage: "FULL" })).join()).toMatch(/as duas obras do par/);
    expect(errorsOf(item({ old: 1, new: 2, coverage: "PARTIAL" })).join()).toMatch(/beyondFromEpisode/);
    expect(errorsOf(item({ old: 1, new: 2, coverage: "PARTIAL", beyondFromEpisode: 200 })).join()).toMatch(/passa dos 148 episódios/);
    expect(errorsOf(item({ old: 1, new: 2, coverage: "FULL", beyondFromEpisode: 5 })).join()).toMatch(/só vale com coverage PARTIAL/);
    expect(errorsOf({ loot: "reboots-001", items: [{ a: 1, b: 2, verdict: "NOT_REBOOT", reboot: { old: 1, new: 2, coverage: "FULL" } }] }).join()).toMatch(/NOT_REBOOT não leva reboot/);
  });

  it("aceita um lote só de arcos (obras avulsas) e valida os arcos como nos pares", () => {
    const arcsOnly = (list: unknown[], anilistId = 2) => ({ loot: "arcos-001", arcs: [{ anilistId, source: "https://example.org", list }] });
    expect(validateLoot(arcsOnly([{ nameEn: "A", start: 1, end: 20 }, { nameEn: "B", start: 22, end: 148 }]), known).ok).toBe(true);
    expect(errorsOf(arcsOnly([{ nameEn: "A", start: 1, end: 200 }])).join()).toMatch(/passa dos 148/);
    expect(errorsOf(arcsOnly([{ nameEn: "A", start: 1, end: 5 }], 99)).join()).toMatch(/anilistId desconhecido/);
    expect(errorsOf({ loot: "arcos-001" }).join()).toMatch(/ao menos um par/);
    expect(errorsOf({ loot: "arcos-001", arcs: [] }).join()).toMatch(/ao menos um par/);
  });

  it("o reboot é sempre a versão mais atual: a refeita não pode ter estreado antes da antiga", () => {
    const dated = new Map([[1, { episodes: 12, startMs: Date.UTC(1999, 9, 1), title: "Antiga" }], [2, { episodes: 12, startMs: Date.UTC(2011, 9, 1), title: "Nova" }]]);
    const item = (old: number, nu: number) => ({ loot: "reboots-001", items: [{ a: 1, b: 2, verdict: "REBOOT", reboot: { old, new: nu, coverage: "FULL" } }] });
    expect(validateLoot(item(1, 2), dated).ok).toBe(true);
    const reversed = validateLoot(item(2, 1), dated);
    expect(reversed.ok).toBe(false);
    expect(reversed.ok ? [] : reversed.errors.join()).toMatch(/sempre a versão mais atual.*Antiga estreou antes de Nova/);
  });

  it("os arcos precisam estar em ordem, sem sobreposição e dentro dos episódios", () => {
    const withArcs = (list: unknown[], anilistId = 2) => ({ loot: "reboots-001", items: [{ a: 1, b: 2, verdict: "NOT_REBOOT", arcs: [{ anilistId, list }] }] });
    expect(errorsOf(withArcs([{ nameEn: "A", start: 1, end: 10 }, { nameEn: "B", start: 10, end: 20 }])).join()).toMatch(/sem sobreposição/);
    expect(errorsOf(withArcs([{ nameEn: "A", start: 5, end: 3 }])).join()).toMatch(/start ≤ end/);
    expect(errorsOf(withArcs([{ nameEn: "A", start: 1, end: 200 }])).join()).toMatch(/passa dos 148/);
    expect(errorsOf(withArcs([{ nameEn: "", start: 1, end: 2 }])).join()).toMatch(/nameEn é obrigatório/);
    expect(errorsOf(withArcs([{ nameEn: "A", start: 1, end: 2 }], 99)).join()).toMatch(/anilistId desconhecido/);
    expect(errorsOf(withArcs([])).join()).toMatch(/de 1 a 40 arcos/);
  });

  it("o mesmo par duas vezes no lote é erro", () => {
    expect(errorsOf({ loot: "reboots-001", items: [{ a: 1, b: 2, verdict: "NOT_REBOOT" }, { a: 2, b: 1, verdict: "NOT_REBOOT" }] }).join()).toMatch(/duas vezes/);
  });
});

describe("marcadores do reboot", () => {
  const other = { anilistId: 9, titleRomaji: "Outra", titleEnglish: null, titleNative: null, coverImage: null, seasonYear: 2011, episodes: 148 };
  const relation = (role: StoryRelation["role"], coverage: StoryRelation["coverage"]): StoryRelation => ({ role, other, coverage, beyondFromEpisode: coverage === "PARTIAL" ? 76 : null, beyondArc: coverage === "PARTIAL" ? { nameEn: "Chimera Ant", namePt: null, nameJa: null } : null, note: null, source: null });

  it("no reboot que vai além, o ponto em que isso começa; na versão antiga, o aviso de que continua no reboot", () => {
    expect(storyMarkersOf([relation("REBOOT", "PARTIAL")])).toEqual({ beyondFrom: { episode: 76, originalId: 9, originalTitle: "Outra" }, continuesIn: null });
    expect(storyMarkersOf([relation("ORIGINAL", "PARTIAL")])).toEqual({ beyondFrom: null, continuesIn: { anilistId: 9, title: "Outra", fromEpisode: 76, arcName: "Chimera Ant" } });
  });
  it("reboot da mesma história (FULL) não marca nada na linha do tempo", () => {
    expect(storyMarkersOf([relation("REBOOT", "FULL"), relation("ORIGINAL", "FULL")])).toEqual({ beyondFrom: null, continuesIn: null });
  });
});

describe("as versões de um reboot têm linhas do tempo separadas", () => {
  const node = (anilistId: number, relations: OrderNode["relations"]): OrderNode => ({ anilistId, kind: "EPISODE", startDate: Date.UTC(1999 + anilistId, 0, 1), season: null, seasonYear: null, relations });
  // 1 (versão antiga) <-ALTERNATIVE-> 2 (reboot); 3 é uma sequência do 2; 4 é uma sequência do 1.
  const nodes = [node(1, [{ id: 2, relationType: "ALTERNATIVE" }, { id: 4, relationType: "SEQUEL" }]), node(2, [{ id: 1, relationType: "ALTERNATIVE" }, { id: 3, relationType: "SEQUEL" }]), node(3, [{ id: 2, relationType: "PREQUEL" }]), node(4, [{ id: 1, relationType: "PREQUEL" }])];

  it("sem o vínculo, as duas versões caem na mesma franquia; com ele, cada uma tem a sua", () => {
    expect(placeFranchises(nodes)).toHaveLength(1);
    const split = placeFranchises(nodes, excludedEdges([{ oldAnilistId: 1, newAnilistId: 2 }]));
    expect(split.map((f) => f.members.map((m) => m.anilistId).sort())).toEqual([[1, 4], [2, 3]]);
  });

  it("a linha do tempo de uma versão não alcança a outra", () => {
    const map = new Map<number, TimelineNode>(nodes.map((n) => [n.anilistId, { anilistId: n.anilistId, titleRomaji: `T${n.anilistId}`, titleEnglish: null, titleNative: null, kind: "EPISODE", format: "TV", season: null, seasonYear: null, startDate: new Date(n.startDate as number).toISOString(), episodes: 12, coverImage: null, relations: [...n.relations] }]));
    const ids = (t: ReturnType<typeof buildTimeline>) => [...(t?.main ?? []), ...(t?.related ?? []), ...(t?.specials ?? [])].map((e) => e.anilistId).sort();
    expect(ids(buildTimeline(2, map))).toEqual([1, 2, 3, 4]);
    expect(ids(buildTimeline(2, map, excludedEdges([{ oldAnilistId: 1, newAnilistId: 2 }])))).toEqual([2, 3]);
    expect(ids(buildTimeline(1, map, excludedEdges([{ oldAnilistId: 1, newAnilistId: 2 }])))).toEqual([1, 4]);
  });
});
