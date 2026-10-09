import { describe, expect, it } from "vitest";
import { ingestionStatus } from "./ingestionRuns";

describe("ingestionStatus", () => {
  it("OK quando nada falhou (mesmo sem itens)", () => {
    expect(ingestionStatus(10, 0)).toBe("OK");
    expect(ingestionStatus(0, 0)).toBe("OK");
  });

  it("PARTIAL quando parte entrou e parte falhou", () => {
    expect(ingestionStatus(10, 2)).toBe("PARTIAL");
  });

  it("ERROR quando nada entrou e houve falha", () => {
    expect(ingestionStatus(0, 3)).toBe("ERROR");
  });
});
