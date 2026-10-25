import { describe, expect, it } from "vitest";
import { diffFields, normalizeValue } from "./changeLog";

describe("histórico de alterações", () => {
  it("compara valores de qualquer tipo, tratando nulo e indefinido como vazio", () => {
    expect(normalizeValue(undefined)).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue(new Date("2026-10-19T13:00:00Z"))).toBe('"2026-10-19T13:00:00.000Z"');
    expect(normalizeValue(["Comedy", "Drama"])).toBe('["Comedy","Drama"]');
  });

  it("só registra o que mudou, e só nos campos pedidos", () => {
    const before = { titleRomaji: "A", description: null, episodes: 12, startDate: new Date("2026-01-01T00:00:00Z") };
    const after = { titleRomaji: "A", description: "Nova", episodes: 13, startDate: new Date("2026-01-01T00:00:00Z") };
    expect(diffFields(before, after)).toEqual([
      { field: "description", before: null, after: "Nova" },
      { field: "episodes", before: 12, after: 13 },
    ]);
    expect(diffFields(before, after, ["episodes"])).toEqual([{ field: "episodes", before: 12, after: 13 }]);
    expect(diffFields(before, { description: undefined })).toEqual([]);
  });
});
