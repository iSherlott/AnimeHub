/**
 * Motivos de pendência da curadoria (Epic 42). Cada um vira uma linha em `CurationIssue` por obra e aparece no painel
 * Admin → Curadoria e no ADR de pendências (docs/adr). São coisas que a curadoria não conseguiu resolver sozinha porque a
 * fonte não tem o dado — nunca são preenchidas com um palpite.
 */
export const ISSUE_CODES = [
  "ANILIST_NOT_FOUND",
  "KIND_UNKNOWN",
  "NO_GENRE",
  "SYNOPSIS_EN_MISSING",
  "TITLE_EN_MISSING",
  "TITLE_JA_MISSING",
  "OFFICIAL_SITE_MISSING",
  "ADULT_REMOVED",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export const ISSUE_LABELS: Record<IssueCode, { title: string; why: string }> = {
  ANILIST_NOT_FOUND: { title: "A AniList não devolveu a obra", why: "O id existe no catálogo mas a AniList não o encontrou (removido ou trocado). Os dados ficam como estão." },
  KIND_UNKNOWN: { title: "Tipo desconhecido", why: "A fonte não informa se é série, OVA, ODA ou filme; sem o formato não dá para classificar." },
  NO_GENRE: { title: "Sem gênero reconhecido", why: "Nenhum gênero ou etiqueta da fonte corresponde à lista de 18 gêneros da plataforma." },
  SYNOPSIS_EN_MISSING: { title: "Sem sinopse", why: "Nem a AniList nem o AniDB trouxeram sinopse; sem o original não há o que traduzir para português e japonês." },
  TITLE_EN_MISSING: { title: "Sem título em inglês", why: "A fonte só tem o título em romaji/japonês (comum em obras sem lançamento internacional)." },
  TITLE_JA_MISSING: { title: "Sem título em japonês", why: "A fonte não traz o título nativo (comum em obras chinesas, coreanas e do AniDB)." },
  OFFICIAL_SITE_MISSING: { title: "Sem site oficial", why: "A AniList não lista o site oficial da obra; o AniDB não traz esse link no lote importado." },
  ADULT_REMOVED: { title: "Conteúdo adulto retirado", why: "A obra foi marcada como adulta pela AniList e saiu da plataforma." },
};

export function isIssueCode(value: unknown): value is IssueCode {
  return typeof value === "string" && (ISSUE_CODES as readonly string[]).includes(value);
}
