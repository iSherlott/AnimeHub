/**
 * Hashtags (Figma `13:41840`, `13:42068`; D-13 recomendação): Unicode
 * (letras, números e "_"), case-insensitive com ID canônico, sem duplicatas
 * por caixa e com tipo (obra · temporada · gênero · tópico). A hashtag NUNCA
 * associa o post a um anime — só a escolha explícita do compositor associa.
 */

/** Máximo de hashtags distintas por publicação (D-13: valor provisório, aguardando decisão). */
export const MAX_HASHTAGS_PER_POST = 5;
export const MAX_HASHTAG_LENGTH = 40;

export type HashtagKind = "WORK" | "SEASON" | "GENRE" | "TOPIC";

// \p{L} = qualquer letra Unicode (inclui acentos, kana, kanji), \p{N} = números, \p{M} = marcas combinantes.
const HASHTAG_PATTERN = /(^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_\p{M}]{1,80})/gu;

export type ExtractedHashtag = { key: string; display: string };

/** ID canônico: NFKC + minúsculas. `#AnimeFall2026` e `#animefall2026` colapsam. */
export function canonicalHashtagKey(raw: string): string {
  return raw.normalize("NFKC").toLowerCase();
}

/** Extrai hashtags distintas (na ordem em que aparecem), preservando o nome de exibição da 1ª ocorrência. */
export function extractHashtags(text: string): ExtractedHashtag[] {
  const seen = new Map<string, ExtractedHashtag>();
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const display = match[2].normalize("NFKC");
    const key = canonicalHashtagKey(display);
    if (key.length === 0 || key.length > MAX_HASHTAG_LENGTH) continue;
    // Só dígitos (ex.: "#2026") não é tema — evita "#1", "#10" de listas numeradas.
    if (/^\p{N}+$/u.test(key)) continue;
    if (!seen.has(key)) seen.set(key, { key, display });
  }
  return [...seen.values()];
}

const SEASON_KEY = /^(anime)?(winter|spring|summer|fall|autumn|inverno|primavera|verao|verão|outono)\d{4}$/u;
const GENRE_KEYS = new Set([
  "mistério", "misterio", "mystery", "fantasia", "fantasy", "romance", "comédia", "comedia", "comedy",
  "ação", "acao", "action", "drama", "terror", "horror", "esporte", "sports", "sci-fi", "scifi",
  "isekai", "slice_of_life", "sliceoflife",
]);

/** Heurística de tipo para a lateral "Encontre outra conversa" (obra · temporada · gênero · tópico). */
export function classifyHashtag(key: string, opts: { workKeys?: ReadonlySet<string> } = {}): HashtagKind {
  if (SEASON_KEY.test(key)) return "SEASON";
  if (opts.workKeys?.has(key)) return "WORK";
  if (GENRE_KEYS.has(key)) return "GENRE";
  return "TOPIC";
}

export type BodySegment = { type: "text"; value: string } | { type: "hashtag"; value: string; key: string };

/** Quebra o texto em trechos para renderizar hashtags como links (sem HTML, sem dangerouslySetInnerHTML). */
export function splitBodyByHashtags(text: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const prefix = match[1];
    const raw = match[2];
    const start = (match.index ?? 0) + prefix.length;
    const key = canonicalHashtagKey(raw);
    if (key.length > MAX_HASHTAG_LENGTH || /^\p{N}+$/u.test(key)) continue;
    if (start > cursor) segments.push({ type: "text", value: text.slice(cursor, start) });
    segments.push({ type: "hashtag", value: `#${raw}`, key });
    cursor = start + 1 + raw.length;
  }
  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}
