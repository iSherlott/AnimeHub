/**
 * Tipo da obra na linha da história (Epic 42). A plataforma separa o que é a história principal do que é complementar:
 *
 * - EPISODE: a série em si (TV, curta de TV, web). Tem temporadas, e uma temporada pode mudar de nome. É o que a pessoa
 *   acompanha e pelo que é avisada.
 * - OVA (Animação Original em Vídeo): especiais que não fazem parte da linha cronológica, histórias complementares.
 * - ODA (DVD de Animação Original): especiais que vêm em DVD, conteúdo a mais que quase nunca entra na história.
 * - MOVIE: filme, que resume parte da temporada ou conta uma história paralela fora da principal.
 * - OTHER: o que não é nenhum dos quatro (videoclipes e músicas).
 *
 * Os especiais não entram na linha obrigatória: aparecem na página da obra, como aviso, mas não geram alerta de episódio.
 */
export const KINDS = ["EPISODE", "OVA", "ODA", "MOVIE", "OTHER"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABELS: Record<Kind, string> = {
  EPISODE: "Episódios",
  OVA: "OVA",
  ODA: "ODA",
  MOVIE: "Filme",
  OTHER: "Outros",
};

export function isKind(value: unknown): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

/** Tipos que fazem parte da história principal; os demais são complementares (opcionais). */
export function isMainLine(kind: string | null | undefined): boolean {
  return kind === "EPISODE";
}

/** "OAD"/"ODA"/"DVD" no título: a própria obra se diz um especial de DVD. */
const DVD_HINT = /\b(OAD|ODA|DVD|BD\s*(?:&|and)?\s*DVD|bundled|limited edition)\b/i;

/**
 * Classifica pelo tipo da fonte (formato da AniList/AniDB) e, no caso dos especiais, pelo título. Devolve null quando
 * não há formato (o chamador registra a pendência em vez de adivinhar).
 *
 * Regras (ADR 0001): TV, TV_SHORT e ONA → EPISODE; MOVIE → MOVIE; OVA → OVA (ODA se o título se diz de DVD);
 * SPECIAL → ODA (os especiais avulsos da AniList são, em geral, os que acompanham DVD/BD); MUSIC → OTHER.
 */
export function classifyKind({ format, title }: { format: string | null | undefined; title?: string | null }): Kind | null {
  switch ((format ?? "").toUpperCase()) {
    case "TV":
    case "TV_SHORT":
    case "ONA":
      return "EPISODE";
    case "MOVIE":
      return "MOVIE";
    case "OVA":
      return title && DVD_HINT.test(title) ? "ODA" : "OVA";
    case "SPECIAL":
      return "ODA";
    case "MUSIC":
      return "OTHER";
    default:
      return null;
  }
}
