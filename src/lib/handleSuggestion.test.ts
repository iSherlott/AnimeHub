import { describe, expect, it } from "vitest";
import { HANDLE_MAX, HANDLE_MIN, RESERVED_HANDLES, validateHandle } from "@/lib/handle";
// O comando roda no cluster com Node 20 (sem TypeScript), por isso as regras estão repetidas num .mjs.
import * as suggestion from "../../scripts/sugestao-de-usuario.mjs";

describe("sugestão de @ para contas antigas (scripts/sugestao-de-usuario.mjs)", () => {
  it("usa as mesmas regras de src/lib/handle.ts", () => {
    expect(suggestion.HANDLE_MIN).toBe(HANDLE_MIN);
    expect(suggestion.HANDLE_MAX).toBe(HANDLE_MAX);
    expect([...suggestion.RESERVED_HANDLES].sort()).toEqual([...RESERVED_HANDLES].sort());
  });

  it("o nome em minúsculas, sem acento, com _ no lugar de espaço e símbolos", () => {
    expect(suggestion.suggestHandle("Sherlott Silva", "x@y.com", new Set())).toBe("sherlott_silva");
    expect(suggestion.suggestHandle("  João-Pedro!! ", "x@y.com", new Set())).toBe("joao_pedro");
    expect(suggestion.suggestHandle("Ana Beatriz de Albuquerque Neto", "x@y.com", new Set())).toBe("ana_beatriz_de_albuq");
  });

  it("sem nome que sirva, o começo do e-mail; sem nada, 'membro'", () => {
    expect(suggestion.suggestHandle("李", "li.wei@exemplo.com", new Set())).toBe("li_wei");
    expect(suggestion.suggestHandle("Jo", "a@b.c", new Set())).toBe("membro");
  });

  it("repetido ou reservado ganha _2, _3… sem passar de 20 caracteres", () => {
    expect(suggestion.suggestHandle("Ana", "a@b.c", new Set(["ana"]))).toBe("ana_2");
    expect(suggestion.suggestHandle("Ana", "a@b.c", new Set(["ana", "ana_2"]))).toBe("ana_3");
    expect(suggestion.suggestHandle("Admin", "a@b.c", new Set())).toBe("admin_2");
    const long = suggestion.suggestHandle("Ana Beatriz de Albuquerque Neto", "x@y.com", new Set(["ana_beatriz_de_albuq"]));
    expect(long).toBe("ana_beatriz_de_alb_2");
    expect(long.length).toBeLessThanOrEqual(HANDLE_MAX);
  });

  it("toda sugestão passa na validação do site", () => {
    const taken = new Set<string>();
    for (const name of ["Sherlott Silva", "E2E Test User", "Ünïcödé Ñame", "x", "Admin", "  ", "a_b", "Fulano de Tal da Silva Sauro"]) {
      const handle = suggestion.suggestHandle(name, "pessoa.qualquer@exemplo.com", taken);
      expect(validateHandle(handle), `${name} → ${handle}`).toBeNull();
      taken.add(handle);
    }
  });

  it("o @ escolhido à mão segue as mesmas regras", () => {
    expect(suggestion.handleProblem("seu_usuario", new Set())).toBeNull();
    expect(suggestion.handleProblem("Com Espaço", new Set())).toMatch(/minúsculas/);
    expect(suggestion.handleProblem("ab", new Set())).toMatch(/3 a 20/);
    expect(suggestion.handleProblem("admin", new Set())).toMatch(/reservado/);
    expect(suggestion.handleProblem("ocupado", new Set(["ocupado"]))).toMatch(/em uso/);
  });
});
