import { describe, expect, it } from "vitest";
import { ADULT_CONTENT_BLOCKED, hasBlockedGenre, isAdultContent, NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";

describe("política de conteúdo adulto como categoria", () => {
  it("o bloqueio está desligado: nada é barrado, nem o Hentai", () => {
    expect(ADULT_CONTENT_BLOCKED).toBe(false);
    expect(hasBlockedGenre(["Comedy", "Hentai"])).toBe(false);
    expect(hasBlockedGenre("Comedy, hentai ,Romance")).toBe(false);
    expect(NOT_BLOCKED_GENRE).toEqual({});
  });

  it("reconhece o conteúdo adulto pelo gênero Hentai, em lista ou em texto, sem diferenciar caixa nem espaços", () => {
    expect(isAdultContent(["Comedy", "Hentai"])).toBe(true);
    expect(isAdultContent("Comedy, hentai ,Romance")).toBe(true);
    expect(isAdultContent(["HENTAI"])).toBe(true);
  });

  it("Ecchi, gêneros comuns e vazio não são conteúdo adulto", () => {
    expect(isAdultContent(["Ecchi", "Comedy"])).toBe(false);
    expect(isAdultContent("Comedy,Romance")).toBe(false);
    expect(isAdultContent([])).toBe(false);
    expect(isAdultContent("")).toBe(false);
    expect(isAdultContent(null)).toBe(false);
    expect(isAdultContent(undefined)).toBe(false);
  });
});
