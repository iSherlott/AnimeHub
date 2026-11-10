import { describe, expect, it } from "vitest";
import { failedRunAlerts, staleServiceAlert } from "./systemAlerts";

const service = { source: "notifier", label: "Avisos de lançamento (notifier)", staleAfterMs: 30 * 60 * 1000 };
const now = new Date("2026-11-10T15:00:00Z");

describe("avisos do sistema", () => {
  it("só execução com ERROR vira aviso, com a chave da execução", () => {
    const runs = [
      { id: "a", status: "ERROR", startedAt: now, message: "AniList 500" },
      { id: "b", status: "PARTIAL", startedAt: now, message: null },
      { id: "c", status: "OK", startedAt: now, message: null },
    ];
    expect(failedRunAlerts("news", "Busca de notícias", "/admin/scrapers", runs)).toEqual([
      { key: "news:a", source: "news", title: "Busca de notícias falhou", message: "AniList 500", href: "/admin/scrapers" },
    ]);
  });

  it("serviço parado: só depois do limite, só se rodava antes, um aviso por dia", () => {
    expect(staleServiceAlert(service, new Date(now.getTime() - 10 * 60_000), true, now)).toBeNull();
    expect(staleServiceAlert(service, null, false, now)).toBeNull();
    expect(staleServiceAlert(service, new Date(now.getTime() - 3 * 3600_000), false, now)).toBeNull();
    const stale = staleServiceAlert(service, new Date(now.getTime() - 3 * 3600_000), true, now);
    expect(stale).toMatchObject({ key: "stale:notifier:2026-11-10", title: "Avisos de lançamento (notifier) parou de rodar" });
    expect(stale?.message).toContain("há 3 h");
    expect(staleServiceAlert(service, new Date(now.getTime() - 45 * 60_000), true, now)?.message).toContain("há 45 min");
  });
});
