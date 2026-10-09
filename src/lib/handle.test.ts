import { describe, expect, it } from "vitest";
import { normalizeHandle, validateHandle } from "./handle";

describe("handle", () => {
  it("normaliza: tira @, espaços e usa minúsculas", () => {
    expect(normalizeHandle("  @MariaSilva ")).toBe("mariasilva");
  });

  it("aceita letras, números e _ dentro de 3 a 20 caracteres", () => {
    expect(validateHandle("maria_silva2")).toBeNull();
    expect(validateHandle("abc")).toBeNull();
    expect(validateHandle("a".repeat(20))).toBeNull();
  });

  it("rejeita curto, longo, acento, símbolos e reservados", () => {
    expect(validateHandle("ab")).toMatch(/3 a 20/);
    expect(validateHandle("a".repeat(21))).toMatch(/3 a 20/);
    expect(validateHandle("joão")).toMatch(/sem acento/);
    expect(validateHandle("nome.com")).toMatch(/sem acento/);
    expect(validateHandle("com espaco")).toMatch(/sem acento/);
    expect(validateHandle("admin")).toMatch(/não está disponível/);
  });
});
