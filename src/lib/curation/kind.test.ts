import { describe, expect, it } from "vitest";
import { classifyKind, isMainLine, KIND_LABELS, KINDS } from "./kind";

describe("classifyKind", () => {
  it("séries (TV, curta de TV e web) são episódios", () => {
    expect(classifyKind({ format: "TV" })).toBe("EPISODE");
    expect(classifyKind({ format: "TV_SHORT" })).toBe("EPISODE");
    expect(classifyKind({ format: "ONA" })).toBe("EPISODE");
  });

  it("filme é filme e OVA é OVA", () => {
    expect(classifyKind({ format: "MOVIE" })).toBe("MOVIE");
    expect(classifyKind({ format: "OVA", title: "Seitokai Yakuindomo OVA" })).toBe("OVA");
  });

  it("OVA que se diz de DVD (OAD/ODA/DVD no título) é ODA", () => {
    expect(classifyKind({ format: "OVA", title: "Fate/stay night OAD" })).toBe("ODA");
    expect(classifyKind({ format: "OVA", title: "Gintama DVD Special" })).toBe("ODA");
    expect(classifyKind({ format: "OVA", title: "Dvorak no Mori" })).toBe("OVA"); // "DVD" só como palavra inteira
  });

  it("especial avulso da AniList é ODA e música fica em Outros", () => {
    expect(classifyKind({ format: "SPECIAL" })).toBe("ODA");
    expect(classifyKind({ format: "MUSIC" })).toBe("OTHER");
  });

  it("sem formato não adivinha", () => {
    expect(classifyKind({ format: null })).toBeNull();
    expect(classifyKind({ format: "" })).toBeNull();
    expect(classifyKind({ format: "ALGO_NOVO" })).toBeNull();
  });

  it("aceita o formato em minúsculas", () => {
    expect(classifyKind({ format: "tv" })).toBe("EPISODE");
  });
});

describe("tipos", () => {
  it("só episódios são a linha principal", () => {
    expect(KINDS.filter((k) => isMainLine(k))).toEqual(["EPISODE"]);
    expect(isMainLine(null)).toBe(false);
  });

  it("todo tipo tem rótulo", () => {
    for (const k of KINDS) expect(KIND_LABELS[k]).toBeTruthy();
  });
});
