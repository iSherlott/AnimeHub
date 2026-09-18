import { describe, expect, it } from "vitest";
import { isAllowedImageFormat, isWithinMaxSize, MAX_UPLOAD_BYTES } from "@/lib/uploadValidation";

describe("isAllowedImageFormat", () => {
  it("aceita os formatos decodificáveis pelo sharp que fazem sentido pra foto de usuário", () => {
    expect(isAllowedImageFormat("jpeg")).toBe(true);
    expect(isAllowedImageFormat("png")).toBe(true);
    expect(isAllowedImageFormat("webp")).toBe(true);
    expect(isAllowedImageFormat("gif")).toBe(true);
    expect(isAllowedImageFormat("avif")).toBe(true);
  });

  it("rejeita SVG de propósito (pode carregar script) e formato desconhecido/ausente", () => {
    expect(isAllowedImageFormat("svg")).toBe(false);
    expect(isAllowedImageFormat("tiff")).toBe(false);
    expect(isAllowedImageFormat(undefined)).toBe(false);
  });
});

describe("isWithinMaxSize", () => {
  it("aceita tamanho positivo até o limite, inclusive", () => {
    expect(isWithinMaxSize(1)).toBe(true);
    expect(isWithinMaxSize(MAX_UPLOAD_BYTES)).toBe(true);
  });

  it("rejeita 0 (arquivo vazio) e qualquer coisa acima do limite", () => {
    expect(isWithinMaxSize(0)).toBe(false);
    expect(isWithinMaxSize(MAX_UPLOAD_BYTES + 1)).toBe(false);
  });
});
