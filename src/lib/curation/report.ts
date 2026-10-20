import { ISSUE_CODES, ISSUE_LABELS, type IssueCode } from "./issues";

export type AdrIssueRow = { title: string; anilistId: number | null; anidbId: number | null; detail: string | null };

export type AdrReportInput = {
  generatedAt: Date;
  totalEntries: number;
  /** Pendências abertas por motivo, com todas as linhas. */
  issues: Record<IssueCode, AdrIssueRow[]>;
  /** Obras que já têm a sinopse em português e em japonês guardadas. */
  withPt: number;
  withJa: number;
  /** Obras por tipo (EPISODE, OVA, ODA, MOVIE, OTHER, UNKNOWN). */
  kinds: Record<string, number>;
};

const EXAMPLES = 25;

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const csvFileName = (code: IssueCode) => `${code.toLowerCase().replace(/_/g, "-")}.csv`;

/** CSV de um motivo (UTF-8 com BOM, para abrir certo no Excel). */
export function issuesCsv(rows: AdrIssueRow[]): string {
  const lines = ["titulo,anilistId,anidbId,detalhe", ...rows.map((r) => [r.title, r.anilistId, r.anidbId, r.detail].map(csvCell).join(","))];
  return `﻿${lines.join("\n")}\n`;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1).replace(".", ",")}%` : "0%");

/** O texto do ADR 0002: o que a curadoria não conseguiu resolver, por motivo, com exemplos e o CSV completo de cada um. */
export function buildAdrReport(input: AdrReportInput): string {
  const open = ISSUE_CODES.reduce((sum, code) => sum + input.issues[code].length, 0);
  const lines: string[] = [
    "# ADR 0002 — Pendências da curadoria do catálogo",
    "",
    "- **Status:** aberto (lista de trabalho; cada motivo se fecha quando a fonte passa a ter o dado ou alguém o preenche)",
    `- **Gerado em:** ${input.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC, a partir de ${fmt(input.totalEntries)} obras da plataforma`,
    "- **Origem:** [ADR 0001](0001-curadoria-do-catalogo.md) — Admin → Curadoria (`CurationIssue`)",
    "",
    "A curadoria passou por todas as obras e completou tudo que as fontes (AniList e AniDB) tinham. O que ficou aqui é o que ela",
    "**não conseguiu resolver sozinha**, e nunca foi preenchido por palpite. Cada motivo tem o CSV completo em `docs/adr/pendencias/`",
    "(também disponível em Admin → Curadoria → CSV).",
    "",
    "## Resumo",
    "",
    "| Motivo | Obras | % do catálogo | CSV |",
    "|---|---:|---:|---|",
    ...ISSUE_CODES.map((code) => `| ${ISSUE_LABELS[code].title} | ${fmt(input.issues[code].length)} | ${pct(input.issues[code].length, input.totalEntries)} | [${csvFileName(code)}](pendencias/${csvFileName(code)}) |`),
    `| **Total de pendências abertas** | **${fmt(open)}** | | |`,
    "",
    "## Pendências estruturais (valem para o catálogo inteiro)",
    "",
    `1. **Sinopse em português e em japonês.** ${fmt(input.withPt)} obras (${pct(input.withPt, input.totalEntries)}) já têm a versão em português e ${fmt(input.withJa)} (${pct(input.withJa, input.totalEntries)}) a japonesa guardadas. As demais são traduzidas **sob demanda**: na primeira vez que alguém abre a obra no idioma, a tradução é feita e guardada. Para traduzir tudo de uma vez é preciso uma instância própria do LibreTranslate (\`LIBRETRANSLATE_URL\`); o serviço gratuito limita a poucos milhares de caracteres por dia. **Decisão pendente:** hospedar o LibreTranslate.`,
    "2. **ODA × OVA.** A AniList não separa as duas coisas; `SPECIAL` foi classificado como ODA e `OVA` como OVA (ODA só quando o título diz OAD/ODA/DVD). **Decisão pendente:** confirmar essa regra ou indicar outra fonte para distinguir.",
    "3. **Gênero Loli.** Só é aplicado quando a fonte traz exatamente essa etiqueta (e não adulta); nenhuma obra é deduzida. **Decisão pendente:** se o gênero deve existir sem fonte, quem o atribui (curadoria manual).",
    "4. **Título em português.** Não existe fonte gratuita confiável; continua manual (`Anime.titlePortuguese`).",
    "",
    "## Tipos no catálogo",
    "",
    "| Tipo | Obras |",
    "|---|---:|",
    ...["EPISODE", "OVA", "ODA", "MOVIE", "OTHER", "UNKNOWN"].filter((k) => input.kinds[k]).map((k) => `| ${{ EPISODE: "Episódios", OVA: "OVA", ODA: "ODA", MOVIE: "Filme", OTHER: "Outros", UNKNOWN: "Sem tipo" }[k]} | ${fmt(input.kinds[k])} |`),
    "",
  ];

  for (const code of ISSUE_CODES) {
    const rows = input.issues[code];
    lines.push(`## ${ISSUE_LABELS[code].title} (${fmt(rows.length)})`, "", ISSUE_LABELS[code].why, "");
    if (rows.length === 0) {
      lines.push("_Nenhuma pendência._", "");
      continue;
    }
    lines.push(`Primeiras ${Math.min(EXAMPLES, rows.length)} de ${fmt(rows.length)} (lista completa em [${csvFileName(code)}](pendencias/${csvFileName(code)})):`, "");
    for (const row of rows.slice(0, EXAMPLES)) {
      const id = row.anilistId ? `AniList ${row.anilistId}` : row.anidbId ? `AniDB ${row.anidbId}` : "sem id";
      lines.push(`- ${row.title} — ${id}${row.detail ? ` — ${row.detail}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
