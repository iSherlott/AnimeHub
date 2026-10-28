import { describe, expect, it } from "vitest";
import { sortDirectory, type DirectoryStats } from "@/lib/community";

const stats = (members: number, created: string | null, activity: string | null): DirectoryStats => ({ members, topics: 0, createdAt: created ? new Date(created) : null, lastActivityAt: activity ? new Date(activity) : null });

describe("sortDirectory (ordem do Explorar comunidades)", () => {
  const rows = [
    { key: "a", rank: 0, stats: stats(1, "2026-10-01", "2026-10-20") },
    { key: "b", rank: 1, stats: stats(5, "2026-09-01", null) },
    { key: "c", rank: 2, stats: undefined }, // ainda sem comunidade gravada
    { key: "d", rank: 3, stats: stats(5, "2026-10-10", "2026-10-25") },
  ];

  it("mais membros; no empate, a obra mais popular", () => {
    expect(sortDirectory(rows, "membros").map((r) => r.key)).toEqual(["b", "d", "a", "c"]);
  });

  it("mais novas; sem comunidade gravada vai para o fim", () => {
    expect(sortDirectory(rows, "novas").map((r) => r.key)).toEqual(["d", "a", "b", "c"]);
  });

  it("atividade recente; sem atividade desempata por membros", () => {
    expect(sortDirectory(rows, "atividade").map((r) => r.key)).toEqual(["d", "a", "b", "c"]);
  });
});
