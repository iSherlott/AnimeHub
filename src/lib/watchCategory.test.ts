import { describe, expect, it } from "vitest";
import { deriveCategory, isWatchState, type CategoryInput } from "@/lib/watchCategory";

const current = { season: "FALL", year: 2026 } as const;
const input = (extra: Partial<CategoryInput>): CategoryInput => ({ watchState: null, hasPending: false, waiting: false, status: null, season: null, seasonYear: null, ...extra });

describe("deriveCategory", () => {
  it("continuação no ar vira 'acompanhando nesta temporada'", () => {
    expect(deriveCategory(input({ status: "RELEASING" }), current)).toBe("watching");
  });
  it("obra já exibida, sem nada adiado, é 'terminei'", () => {
    expect(deriveCategory(input({ status: "FINISHED" }), current)).toBe("finished");
  });
  it("episódio adiado é 'não terminei', mesmo no ar ou já finalizada", () => {
    expect(deriveCategory(input({ status: "RELEASING", hasPending: true }), current)).toBe("unfinished");
    expect(deriveCategory(input({ status: "FINISHED", hasPending: true }), current)).toBe("unfinished");
  });
  it("sequência por estrear: desta temporada acompanha; de outra fica só em 'Todos'", () => {
    expect(deriveCategory(input({ status: "NOT_YET_RELEASED", season: "FALL", seasonYear: 2026 }), current)).toBe("watching");
    expect(deriveCategory(input({ status: "NOT_YET_RELEASED", season: "WINTER", seasonYear: 2027 }), current)).toBe("other");
    expect(deriveCategory(input({ status: "NOT_YET_RELEASED" }), current)).toBe("other");
  });
  it("em espera não é acompanhada nem terminada", () => {
    expect(deriveCategory(input({ status: "RELEASING", waiting: true }), current)).toBe("other");
  });
  it("a marcação manual vence qualquer dedução", () => {
    expect(deriveCategory(input({ watchState: "FINISHED", status: "RELEASING", hasPending: true }), current)).toBe("finished");
    expect(deriveCategory(input({ watchState: "UNFINISHED", status: "FINISHED" }), current)).toBe("unfinished");
    expect(deriveCategory(input({ watchState: "WATCHING", status: "NOT_YET_RELEASED", waiting: true }), current)).toBe("watching");
  });
  it("valor de marcação desconhecido é ignorado", () => {
    expect(isWatchState("QUASE")).toBe(false);
    expect(deriveCategory(input({ watchState: "QUASE", status: "FINISHED" }), current)).toBe("finished");
  });
});
