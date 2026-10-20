import { describe, expect, it } from "vitest";
import { ISSUE_CODES, type IssueCode } from "./issues";
import { buildAdrReport, csvFileName, issuesCsv, type AdrReportInput } from "./report";

const empty = () => Object.fromEntries(ISSUE_CODES.map((c) => [c, []])) as unknown as Record<IssueCode, AdrReportInput["issues"][IssueCode]>;

const input = (over: Partial<AdrReportInput> = {}): AdrReportInput => ({
  generatedAt: new Date("2026-10-20T15:30:00Z"),
  totalEntries: 1000,
  issues: empty(),
  withPt: 250,
  withJa: 0,
  kinds: { EPISODE: 800, OVA: 100, MOVIE: 90, UNKNOWN: 10 },
  ...over,
});

describe("issuesCsv", () => {
  it("escapa vírgulas e aspas e começa com BOM", () => {
    const csv = issuesCsv([{ title: 'Nome, com "aspas"', anilistId: 5, anidbId: null, detail: null }]);
    expect(csv.startsWith("﻿titulo,anilistId,anidbId,detalhe\n")).toBe(true);
    expect(csv).toContain('"Nome, com ""aspas""",5,,');
  });
});

describe("csvFileName", () => {
  it("usa o motivo em minúsculas com hífen", () => {
    expect(csvFileName("TITLE_EN_MISSING")).toBe("title-en-missing.csv");
  });
});

describe("buildAdrReport", () => {
  it("resume por motivo, com contagem, percentual e link do CSV", () => {
    const issues = empty();
    issues.TITLE_EN_MISSING = [{ title: "Obra A", anilistId: 1, anidbId: null, detail: null }, { title: "Obra B", anilistId: null, anidbId: 7, detail: "x" }];
    const md = buildAdrReport(input({ issues }));
    expect(md).toContain("# ADR 0002 — Pendências da curadoria do catálogo");
    expect(md).toContain("| Sem título em inglês | 2 | 0,2% | [title-en-missing.csv](pendencias/title-en-missing.csv) |");
    expect(md).toContain("**Total de pendências abertas** | **2**");
    expect(md).toContain("- Obra A — AniList 1");
    expect(md).toContain("- Obra B — AniDB 7 — x");
  });

  it("limita os exemplos a 25 por motivo e aponta para o CSV", () => {
    const issues = empty();
    issues.NO_GENRE = Array.from({ length: 40 }, (_, i) => ({ title: `Obra ${i}`, anilistId: i, anidbId: null, detail: null }));
    const md = buildAdrReport(input({ issues }));
    expect(md).toContain("Primeiras 25 de 40");
    expect(md).toContain("- Obra 24 — AniList 24");
    expect(md).not.toContain("- Obra 25 — AniList 25");
  });

  it("traz as pendências estruturais e os tipos", () => {
    const md = buildAdrReport(input());
    expect(md).toContain("LibreTranslate");
    expect(md).toContain("ODA × OVA");
    expect(md).toContain("| Episódios | 800 |");
    expect(md).toContain("| Sem tipo | 10 |");
    expect(md).toContain("_Nenhuma pendência._");
  });
});
