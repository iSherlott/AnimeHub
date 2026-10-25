import { ISSUE_CODES, type IssueCode } from "@/lib/curation/issues";

/**
 * Prioridade das pendências de curadoria (Fase 7, §14), pelo impacto no produto:
 *  - alta: identidade ambígua, duplicidade, relação de franquia incoerente, obra que a fonte não acha mais;
 *  - média: o que falta e aparece para as pessoas (sinopse, título japonês, gênero, tipo, temporada, nome estranho);
 *  - informativa: campo opcional que a fonte simplesmente não tem (site oficial, título internacional) e registros.
 * Configurável sem mudar código: a variável `CURATION_PRIORITIES` aceita um JSON `{ "CODIGO": "alta|media|informativa" }`
 * que sobrepõe este padrão (documentado em docs/arquitetura/pendencias.md).
 */
export const PRIORITIES = ["alta", "media", "informativa"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { alta: "Alta", media: "Média", informativa: "Informativa" };

export const DEFAULT_PRIORITY: Record<IssueCode, Priority> = {
  DUPLICATE_SUSPECT: "alta",
  TIMELINE_CONFLICT: "alta",
  ANILIST_NOT_FOUND: "alta",
  NAME_INVALID: "media",
  SYNOPSIS_EN_MISSING: "media",
  TITLE_JA_MISSING: "media",
  NO_GENRE: "media",
  KIND_UNKNOWN: "media",
  TIMELINE_UNDATED: "media",
  TITLE_EN_MISSING: "informativa",
  OFFICIAL_SITE_MISSING: "informativa",
  ADULT_REMOVED: "informativa",
};

function overrides(): Partial<Record<IssueCode, Priority>> {
  try {
    const raw = process.env.CURATION_PRIORITIES ? (JSON.parse(process.env.CURATION_PRIORITIES) as Record<string, string>) : {};
    return Object.fromEntries(Object.entries(raw).filter(([code, p]) => (ISSUE_CODES as readonly string[]).includes(code) && (PRIORITIES as readonly string[]).includes(p))) as Partial<Record<IssueCode, Priority>>;
  } catch {
    return {};
  }
}

export function priorityMap(): Record<IssueCode, Priority> {
  return { ...DEFAULT_PRIORITY, ...overrides() };
}

export function priorityOf(code: string): Priority {
  return priorityMap()[code as IssueCode] ?? "media";
}

export function codesWithPriority(priority: Priority): IssueCode[] {
  const map = priorityMap();
  return ISSUE_CODES.filter((c) => map[c] === priority);
}
