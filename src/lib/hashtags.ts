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

/**
 * Separa a linha FINAL de hashtags do corpo (Figma `13:41204`: o texto vem
 * primeiro e as hashtags numa fileira própria embaixo). Só vale quando a
 * última linha é composta apenas por hashtags; hashtags no meio do texto
 * continuam inline (como links) no corpo.
 */
export function splitTrailingHashtags(text: string): { body: string; tags: Array<{ key: string; display: string }> } {
  const lines = text.replace(/\s+$/, "").split("\n");
  const last = lines[lines.length - 1] ?? "";
  const tokens = last.trim().split(/\s+/).filter(Boolean);
  const onlyTags = tokens.length > 0 && tokens.every((t) => /^#[\p{L}\p{N}_\p{M}]+$/u.test(t));
  if (!onlyTags || lines.length === 1) return { body: text, tags: [] };
  const tags = extractHashtags(last);
  if (tags.length !== tokens.length) return { body: text, tags: [] };
  return { body: lines.slice(0, -1).join("\n").replace(/\s+$/, ""), tags };
}
