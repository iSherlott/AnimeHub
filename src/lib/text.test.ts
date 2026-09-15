import { describe, expect, it } from "vitest";
import { isBlank } from "./text";

describe("isBlank", () => {
  it("considera vazia uma string vazia ou só de espaço normal", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("\n\t")).toBe(true);
  });

  it("não considera vazio um texto de verdade", () => {
    expect(isBlank("Olá")).toBe(false);
    expect(isBlank("  texto  ")).toBe(false);
  });

  // Achado real da 11ª rodada de auditoria (Epic 18): .trim() sozinho
  // aceitava isso como "não vazio", e o valor "verdadeiro-mas-invisível"
  // vencia o fallback de título em resolveTitleText.
  it("considera vazio um texto só de caracteres invisíveis (zero-width space, BOM, etc.)", () => {
    expect(isBlank("​")).toBe(true); // zero-width space
    expect(isBlank("﻿")).toBe(true); // BOM / zero-width no-break space
    expect(isBlank("​‌‍")).toBe(true); // ZWSP + ZWNJ + ZWJ
    expect(isBlank("  ​  ")).toBe(true); // misturado com espaço normal
  });

  it("não remove caracteres invisíveis que estão junto de texto real", () => {
    // A checagem é só pra decidir "vazio ou não" — não deve mexer no valor
    // de verdade que será salvo (fora do escopo desta função).
    expect(isBlank("Olá​mundo")).toBe(false);
  });
});
