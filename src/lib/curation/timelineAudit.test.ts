import { describe, expect, it } from "vitest";
import { checkTitles, cleanTitle } from "./titleCheck";
import { placeFranchises, type OrderNode } from "./franchiseOrder";
import { countDuplicateGroups, findDuplicates, normalizeTitle, type DuplicateInput } from "./duplicates";

describe("cleanTitle / checkTitles", () => {
  it("tira espaços sobrando, entidades HTML e caracteres invisíveis", () => {
    expect(cleanTitle("  Tom &amp; Jerry ​  Tales ")).toBe("Tom & Jerry Tales");
    expect(cleanTitle("Boku no Hero&#039;s")).toBe("Boku no Hero's");
    expect(cleanTitle("   ")).toBeNull();
    expect(cleanTitle(null)).toBeNull();
  });

  it("só devolve os campos que mudaram", () => {
    const ok = checkTitles({ titleRomaji: "Naruto", titleEnglish: "Naruto", titleNative: "ナルト" });
    expect(ok).toEqual({ fixed: {}, problems: [] });
    const fixed = checkTitles({ titleRomaji: "Naruto ", titleEnglish: null, titleNative: "ナルト" });
    expect(fixed.fixed).toEqual({ titleRomaji: "Naruto" });
  });

  it("aponta o que uma pessoa precisa conferir", () => {
    expect(checkTitles({ titleRomaji: "663114", titleEnglish: null, titleNative: null }).problems[0]).toMatch(/só com números/);
    expect(checkTitles({ titleRomaji: "86", titleEnglish: "Eighty-Six", titleNative: null }).problems).toEqual([]);
    expect(checkTitles({ titleRomaji: "T・P Bon", titleEnglish: "T・P Bon", titleNative: "タイムパトロール隊オタスケマン" }).problems).toEqual([]);
    expect(checkTitles({ titleRomaji: "", titleEnglish: null, titleNative: null }).problems).toContain("sem título principal");
    expect(checkTitles({ titleRomaji: "Ok", titleEnglish: "ナルト", titleNative: null }).problems.join()).toMatch(/japoneses/);
    expect(checkTitles({ titleRomaji: "Bad �", titleEnglish: null, titleNative: null }).problems.join()).toMatch(/corrompidos/);
  });
});

const node = (anilistId: number, kind: string | null, year: number | null, relations: OrderNode["relations"] = [], month = 1): OrderNode => ({
  anilistId, kind, startDate: year === null ? null : Date.UTC(year, month - 1, 1), season: null, seasonYear: null, relations,
});

describe("placeFranchises", () => {
  it("põe séries, OVA, ODA e filmes em ordem cronológica, com o papel de cada um", () => {
    const franchises = placeFranchises([
      node(20, "EPISODE", 2010, [{ id: 10, relationType: "PREQUEL" }, { id: 21, relationType: "SIDE_STORY" }]),
      node(10, "EPISODE", 2008, [{ id: 20, relationType: "SEQUEL" }, { id: 11, relationType: "SIDE_STORY" }]),
      node(11, "OVA", 2009, [{ id: 10, relationType: "PARENT" }]),
      node(21, "MOVIE", 2012, [{ id: 20, relationType: "PARENT" }]),
      node(22, "ODA", 2011, [{ id: 20, relationType: "SIDE_STORY" }]),
      node(99, "EPISODE", 2000),
    ]);
    expect(franchises).toHaveLength(2);
    const big = franchises[0];
    expect(big.key).toBe(10);
    expect(big.members.map((m) => [m.anilistId, m.order, m.role, m.season])).toEqual([
      [10, 1, "MAIN", 1],
      [11, 2, "SPECIAL", null],
      [20, 3, "MAIN", 2],
      [22, 4, "SPECIAL", null],
      [21, 5, "SPECIAL", null],
    ]);
    expect(franchises[1].members[0]).toMatchObject({ anilistId: 99, order: 1, role: "MAIN", season: 1 });
  });

  it("outra série ligada fora da corrente de prequel/sequência é RELATED; obra sem data vai para o fim", () => {
    const [franchise] = placeFranchises([
      node(1, "EPISODE", 2000, [{ id: 2, relationType: "SEQUEL" }, { id: 3, relationType: "SPIN_OFF" }, { id: 4, relationType: "SIDE_STORY" }]),
      node(2, "EPISODE", 2002, [{ id: 1, relationType: "PREQUEL" }]),
      node(3, "EPISODE", 2005, [{ id: 1, relationType: "PARENT" }]),
      node(4, "OVA", null, [{ id: 1, relationType: "PARENT" }]),
    ]);
    const role = Object.fromEntries(franchise.members.map((m) => [m.anilistId, m.role]));
    expect(role).toEqual({ 1: "MAIN", 2: "MAIN", 3: "RELATED", 4: "SPECIAL" });
    expect(franchise.members.at(-1)).toMatchObject({ anilistId: 4, undated: true });
  });

  it("ignora relações de personagem e de obras fora do catálogo", () => {
    const franchises = placeFranchises([node(1, "EPISODE", 2000, [{ id: 2, relationType: "CHARACTER" }, { id: 777, relationType: "SEQUEL" }]), node(2, "EPISODE", 2001)]);
    expect(franchises).toHaveLength(2);
  });

  it("acusa a sequência que estreou antes do prequel", () => {
    const [franchise] = placeFranchises([node(1, "EPISODE", 2010, [{ id: 2, relationType: "SEQUEL" }]), node(2, "EPISODE", 2005, [{ id: 1, relationType: "PREQUEL" }])]);
    expect(franchise.members.find((m) => m.anilistId === 2)?.conflict).toMatch(/antes do prequel/);
    expect(franchise.members.find((m) => m.anilistId === 1)?.conflict).toBeNull();
  });
});

const dup = (id: string, titleRomaji: string, extra: Partial<DuplicateInput> = {}): DuplicateInput => ({
  id, anilistId: null, anidbId: null, titleRomaji, titleEnglish: null, titleNative: null, kind: "EPISODE", year: 2010, related: new Set(), ...extra,
});

describe("findDuplicates", () => {
  it("normaliza maiúsculas, acentos e pontuação", () => {
    expect(normalizeTitle("Fullmetal Alchemist: Brotherhood!")).toBe("fullmetalalchemistbrotherhood");
    expect(normalizeTitle("Pokémon")).toBe("pokemon");
    expect(normalizeTitle("2010")).toBeNull();
    expect(normalizeTitle("K")).toBeNull();
  });

  it("acha a mesma obra vinda do AniDB e da AniList, mesmo com a pontuação diferente", () => {
    const matches = findDuplicates([dup("a", "Steins;Gate", { anilistId: 9253 }), dup("b", "STEINS GATE", { anidbId: 8014, year: 2011 }), dup("c", "Outra Coisa")]);
    expect(matches.get("a")?.[0].reason).toMatch(/mesmo título e ano.*fontes diferentes.*AniDB 8014/);
    expect(matches.get("b")?.[0].reason).toMatch(/AniList 9253/);
    expect(matches.has("c")).toBe(false);
    expect(countDuplicateGroups(matches)).toBe(1);
  });

  it("duas entradas da mesma fonte só contam com o título idêntico, pontuação inclusa", () => {
    expect(findDuplicates([dup("a", "NEW GAME!", { anilistId: 1, year: 2016 }), dup("b", "NEW GAME!!", { anilistId: 2, year: 2017 })]).size).toBe(0);
    expect(findDuplicates([dup("a", "Walking Meat", { anilistId: 1 }), dup("b", "walking  meat", { anilistId: 2 })]).size).toBe(2);
    // o título em japonês igual não basta (OVAs diferentes de uma mesma série)
    expect(findDuplicates([dup("a", "Blade OVA 1", { anilistId: 1, titleNative: "テッカマンブレード" }), dup("b", "Blade OVA 2", { anilistId: 2, titleNative: "テッカマンブレード" })]).size).toBe(0);
  });

  it("não confunde tipos diferentes, anos distantes nem obras da mesma franquia", () => {
    expect(findDuplicates([dup("a", "Gintama", { anilistId: 1 }), dup("b", "Gintama", { kind: "MOVIE", anilistId: 2 })]).size).toBe(0);
    expect(findDuplicates([dup("a", "Hunter x Hunter", { year: 1999, anilistId: 1 }), dup("b", "Hunter x Hunter", { year: 2011, anilistId: 2 })]).size).toBe(0);
    expect(findDuplicates([dup("a", "Bleach", { anilistId: 1, related: new Set([2]) }), dup("b", "Bleach", { anilistId: 2 })]).size).toBe(0);
  });

  it("ano desconhecido em uma das obras também é apontado", () => {
    expect(findDuplicates([dup("a", "Akira", { anilistId: 1 }), dup("b", "Akira", { anilistId: 2, year: null })]).get("a")?.[0].reason).toMatch(/ano desconhecido/);
  });
});
