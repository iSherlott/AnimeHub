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
  "NAME_INVALID",
  "DUPLICATE_SUSPECT",
  "TIMELINE_UNDATED",
  "TIMELINE_CONFLICT",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/** Pendências da auditoria das linhas do tempo (Epic 45): gravadas e resolvidas por ela, não pela curadoria. */
export const AUDIT_CODES = ["NAME_INVALID", "DUPLICATE_SUSPECT", "TIMELINE_UNDATED", "TIMELINE_CONFLICT"] as const satisfies readonly IssueCode[];

export const ISSUE_LABELS: Record<IssueCode, { title: string; why: string }> = {
  ANILIST_NOT_FOUND: { title: "A AniList não devolveu a obra", why: "O id existe no catálogo mas a AniList não o encontrou (removido ou trocado). Os dados ficam como estão." },
  KIND_UNKNOWN: { title: "Tipo desconhecido", why: "A fonte não informa se é série, OVA, ODA ou filme; sem o formato não dá para classificar." },
  NO_GENRE: { title: "Sem gênero reconhecido", why: "Nenhum gênero ou etiqueta da fonte corresponde à lista de 18 gêneros da plataforma." },
  SYNOPSIS_EN_MISSING: { title: "Sem sinopse", why: "Nem a AniList nem o AniDB trouxeram sinopse; sem o original não há o que traduzir para português e japonês." },
  TITLE_EN_MISSING: { title: "Sem título em inglês", why: "A fonte só tem o título em romaji/japonês (comum em obras sem lançamento internacional)." },
  TITLE_JA_MISSING: { title: "Sem título em japonês", why: "A fonte não traz o título nativo (comum em obras chinesas, coreanas e do AniDB)." },
  OFFICIAL_SITE_MISSING: { title: "Sem site oficial", why: "A AniList não lista o site oficial da obra; o AniDB não traz esse link no lote importado." },
  ADULT_REMOVED: { title: "Conteúdo adulto retirado", why: "A obra foi marcada como adulta pela AniList e saiu da plataforma." },
  NAME_INVALID: { title: "Nome para conferir", why: "O nome da obra tem algo que não dá para corrigir sozinho (só números, texto corrompido, japonês no campo de inglês). Espaços e entidades HTML sobrando já foram corrigidos." },
  DUPLICATE_SUSPECT: { title: "Possível obra duplicada", why: "Outra obra tem o mesmo id na MyAnimeList, ou o mesmo título (sem contar maiúsculas, acentos e pontuação), o mesmo tipo e o mesmo ano. Quem decide se é a mesma é uma pessoa." },
  TIMELINE_UNDATED: { title: "Sem data para a linha do tempo", why: "Nem a data de estreia nem a temporada são conhecidas; a obra fica no fim da linha do tempo da franquia, sem posição garantida." },
  TIMELINE_CONFLICT: { title: "Estreia antes do prequel", why: "A AniList diz que a série é sequência de outra, mas ela estreou antes do prequel. Ou uma data está errada, ou a relação segue a ordem da história (Gundam, Dragon Ball…) e não a de estreia; a linha do tempo usa a ordem de estreia." },
};

export function isIssueCode(value: unknown): value is IssueCode {
  return typeof value === "string" && (ISSUE_CODES as readonly string[]).includes(value);
}
