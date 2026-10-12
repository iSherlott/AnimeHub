import { describe, expect, it } from "vitest";
import { hasBlockedGenre } from "@/lib/contentPolicy";

describe("hasBlockedGenre", () => {
  it("bloqueia o gênero Hentai em lista ou em texto, sem diferenciar caixa nem espaços", () => {
    expect(hasBlockedGenre(["Comedy", "Hentai"])).toBe(true);
    expect(hasBlockedGenre("Comedy, hentai ,Romance")).toBe(true);
    expect(hasBlockedGenre(["HENTAI"])).toBe(true);
  });

  it("não bloqueia Ecchi nem gêneros comuns, nem vazio", () => {
    expect(hasBlockedGenre(["Ecchi", "Comedy"])).toBe(false);
    expect(hasBlockedGenre("Comedy,Romance")).toBe(false);
    expect(hasBlockedGenre([])).toBe(false);
    expect(hasBlockedGenre("")).toBe(false);
    expect(hasBlockedGenre(null)).toBe(false);
    expect(hasBlockedGenre(undefined)).toBe(false);
  });
});
