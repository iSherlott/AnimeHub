import { describe, expect, it } from "vitest";
import { prequelIds } from "./continuation";

describe("prequelIds", () => {
  it("devolve só os PREQUEL das relações da produção", () => {
    const json = JSON.stringify([
      { id: 10, titleRomaji: "Anterior", format: "TV", relationType: "PREQUEL" },
      { id: 11, titleRomaji: "Seguinte", format: "TV", relationType: "SEQUEL" },
      { id: 12, titleRomaji: "Derivada", format: "OVA", relationType: "SPIN_OFF" },
    ]);
    expect(prequelIds(json)).toEqual([10]);
  });

  it("JSON ausente, inválido ou fora do formato não quebra", () => {
    expect(prequelIds(null)).toEqual([]);
    expect(prequelIds("{nao é json")).toEqual([]);
    expect(prequelIds(JSON.stringify({ id: 1, relationType: "PREQUEL" }))).toEqual([]);
    expect(prequelIds(JSON.stringify([{ id: "x", relationType: "PREQUEL" }, null]))).toEqual([]);
  });
});
