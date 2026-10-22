import { describe, expect, it } from "vitest";
import { assignBranches, branchesOf, interleave, type Branch } from "./workJourney";
import type { TimelineEntry } from "@/lib/curation/timeline";

const special = (anilistId: number, startDate: string | null, kind = "OVA", seasonYear: number | null = null): TimelineEntry => ({
  anilistId, titleRomaji: `S${anilistId}`, titleEnglish: null, titleNative: null, kind, format: kind, season: null, seasonYear, startDate, episodes: 1, coverImage: null, current: false,
});
const ms = (iso: string) => Date.parse(iso);

describe("branchesOf", () => {
  it("usa a data de estreia; só o ano vira o começo do ano; sem nada fica sem data", () => {
    const [a, b, c] = branchesOf([special(1, "2021-04-10T00:00:00Z"), special(2, null, "MOVIE", 2022), special(3, null)]);
    expect(a.whenMs).toBe(ms("2021-04-10T00:00:00Z"));
    expect(b.whenMs).toBe(Date.UTC(2022, 0, 1));
    expect(c.whenMs).toBeNull();
  });
});

describe("assignBranches", () => {
  const seasons = [
    { anilistId: 10, season: "FALL", seasonYear: 2020 },
    { anilistId: 20, season: "FALL", seasonYear: 2022 },
  ];
  it("cada especial vai para a última temporada que já tinha começado; o mais antigo, para a primeira; o sem data, para a última", () => {
    const result = assignBranches(seasons, branchesOf([special(1, "2021-04-10T00:00:00Z"), special(2, "2019-01-01T00:00:00Z"), special(3, "2023-03-01T00:00:00Z", "MOVIE"), special(4, null)]));
    expect(result[10].map((b) => b.anilistId)).toEqual([2, 1]);
    expect(result[20].map((b) => b.anilistId)).toEqual([3, 4]);
  });
  it("sem temporadas não há onde ramificar", () => {
    expect(assignBranches([], branchesOf([special(1, "2021-04-10T00:00:00Z")]))).toEqual({});
  });
});

describe("interleave", () => {
  const eps = [1, 2, 3].map((n) => ({ n, dateMs: ms(`2020-10-0${n}T00:00:00Z`) }));
  const branch = (id: number, whenMs: number | null): Branch => ({ anilistId: id, kind: "OVA", titleRomaji: "x", titleNative: null, whenMs, season: null, seasonYear: null, episodes: 1, relationType: null, current: false });

  it("põe a ramificação entre os episódios, na ordem de estreia", () => {
    const items = interleave(eps, [branch(9, ms("2020-10-02T12:00:00Z")), branch(8, ms("2020-09-01T00:00:00Z"))]);
    expect(items.map((i) => (i.type === "episode" ? `ep${i.episode.n}` : `b${i.branch.anilistId}`))).toEqual(["b8", "ep1", "ep2", "b9", "ep3"]);
  });
  it("o que veio depois do último episódio, ou não tem data, fica no fim", () => {
    const items = interleave(eps, [branch(7, ms("2021-01-01T00:00:00Z")), branch(6, null)]);
    expect(items.slice(-2).map((i) => (i.type === "branch" ? i.branch.anilistId : 0))).toEqual([7, 6]);
  });
  it("episódios sem data não são ultrapassados por ramificações", () => {
    const items = interleave([{ n: 1, dateMs: null }, { n: 2, dateMs: null }], [branch(5, ms("2020-01-01T00:00:00Z"))]);
    expect(items.map((i) => i.type)).toEqual(["episode", "episode", "branch"]);
  });
});
