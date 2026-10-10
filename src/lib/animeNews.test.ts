import { describe, expect, it } from "vitest";
import { isScheduledNewsDue } from "./animeNews";

describe("isScheduledNewsDue", () => {
  const now = new Date("2026-10-10T15:00:00Z"); // 12:00 em America/Sao_Paulo

  it("é devida quando nunca houve execução agendada", () => {
    expect(isScheduledNewsDue(now, null)).toBe(true);
  });

  it("é devida quando a última foi antes da meia-noite local", () => {
    expect(isScheduledNewsDue(now, new Date("2026-10-10T02:00:00Z"))).toBe(true); // 23:00 de 09/10 em São Paulo
  });

  it("não é devida quando já houve uma hoje", () => {
    expect(isScheduledNewsDue(now, new Date("2026-10-10T09:00:00Z"))).toBe(false);
  });
});
