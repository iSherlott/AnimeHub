import { describe, expect, it } from "vitest";
import { groupActivity } from "./friendActivity";
import { activityText } from "./friendActivityText";

const user = { id: "u1", displayName: "Ana", avatarUrl: null };
const row = (kind: string, at: string, extra: Partial<{ workKey: string; score: number | null; userId: string }> = {}) => ({
  userId: extra.userId ?? "u1",
  workKey: extra.workKey ?? "10",
  kind,
  href: "/anime/10",
  titleRomaji: "Obra",
  titleEnglish: null,
  coverImage: null,
  score: extra.score ?? null,
  createdAt: new Date(at),
  user,
});

describe("atividade dos amigos", () => {
  it("junta terminar e dar nota da mesma obra numa linha; a mais recente primeiro", () => {
    const items = groupActivity(
      [row("RATED", "2026-11-10T10:00:00Z", { score: 9 }), row("FINISHED", "2026-11-10T09:00:00Z"), row("FINISHED", "2026-11-09T09:00:00Z", { workKey: "20" })],
      10
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ workKey: "10", finished: true, score: 9, at: "2026-11-10T10:00:00.000Z" });
    expect(items[1]).toMatchObject({ workKey: "20", finished: true, score: null });
  });

  it("respeita o limite", () => {
    expect(groupActivity([row("FINISHED", "2026-11-10T10:00:00Z"), row("FINISHED", "2026-11-10T09:00:00Z", { workKey: "20" })], 1)).toHaveLength(1);
  });

  it("o texto diz o que aconteceu", () => {
    expect(activityText({ finished: true, score: 9 }, "Frieren")).toBe("terminou Frieren e deu 9");
    expect(activityText({ finished: true, score: null }, "Frieren")).toBe("terminou Frieren");
    expect(activityText({ finished: false, score: 7 }, "Frieren")).toBe("deu 7 para Frieren");
  });
});
