import { describe, expect, it } from "vitest";
import { isReschedule } from "./rescheduleAlerts";

const NOW = new Date("2026-10-09T12:00:00Z");
const at = (iso: string) => new Date(iso);

describe("isReschedule", () => {
  it("ignora variações pequenas (<= 10 min)", () => {
    expect(isReschedule(at("2026-10-10T21:00:00Z"), at("2026-10-10T21:08:00Z"), NOW)).toBe(false);
  });

  it("detecta adiamento de episódio futuro", () => {
    expect(isReschedule(at("2026-10-10T21:00:00Z"), at("2026-10-11T21:00:00Z"), NOW)).toBe(true);
  });

  it("detecta antecipação", () => {
    expect(isReschedule(at("2026-10-12T21:00:00Z"), at("2026-10-10T21:00:00Z"), NOW)).toBe(true);
  });

  it("episódio já exibido corrigido depois não é adiamento", () => {
    expect(isReschedule(at("2026-10-01T21:00:00Z"), at("2026-10-02T21:00:00Z"), NOW)).toBe(false);
  });
});
