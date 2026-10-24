import { describe, expect, it } from "vitest";
import { seasonLabel, typeLabel, workBadges, workFacts } from "./workLabels";

describe("workFacts", () => {
  const catalog = { format: "TV", status: "FINISHED", season: "FALL", seasonYear: 2011, episodes: 148 };

  it("completa com o catálogo o que a cópia não tem", () => {
    const facts = workFacts({ format: null, status: "FINISHED", season: null, seasonYear: null, episodes: 148 }, catalog);
    expect(facts).toEqual(catalog);
    expect(workBadges({ kind: "EPISODE", ...facts })).toEqual(["Série (TV)", "Finalizado", "Outono 2011", "148 episódios"]);
  });

  it("o que a cópia tem continua valendo", () => {
    const facts = workFacts({ format: "ONA", status: "RELEASING", season: "SPRING", seasonYear: 2012, episodes: 12 }, catalog);
    expect(facts).toEqual({ format: "ONA", status: "RELEASING", season: "SPRING", seasonYear: 2012, episodes: 12 });
  });

  it("sem catálogo, fica só a cópia", () => {
    const facts = workFacts({ format: null, status: null, season: null, seasonYear: 2020, episodes: null }, null);
    expect(facts).toEqual({ format: null, status: null, season: null, seasonYear: 2020, episodes: null });
    expect(seasonLabel(facts)).toBe("2020");
    expect(typeLabel({ kind: "EPISODE", format: facts.format })).toBe("Série");
  });
});
