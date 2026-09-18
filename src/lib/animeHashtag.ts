/**
 * Compositor do Feed indica o anime do post por hashtag no próprio texto
 * (#NomeDoAnime, estilo Twitter/Instagram) em vez de um campo separado
 * (Epic 26, pedido direto do usuário). Tudo aqui é puro — sem depender
 * de DOM nem de estado do React — pra dar pra testar isolado.
 */

const HASHTAG_PATTERN = /#([a-zA-Z0-9]+)/g;

/** Normaliza um título pra um "slug" de hashtag: sem acento, sem espaço/
 * pontuação, minúsculo — "Re:Zero − Starting Life..." vira
 * "rezerostartinglife...". Determinístico e sem colisão de propósito
 * (mesma normalização usada tanto pra gerar a sugestão quanto pra casar
 * o que a pessoa digitou). */
const DIACRITIC_COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function animeSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(DIACRITIC_COMBINING_MARKS, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** Todas as hashtags (slugs, já em minúsculo) presentes no texto, na
 * ordem em que aparecem. */
export function extractHashtagSlugs(body: string): string[] {
  return [...body.matchAll(HASHTAG_PATTERN)].map((m) => m[1].toLowerCase());
}

/** Resolve qual anime da lista o post é sobre — a 1ª hashtag do texto que
 * bate com o slug de algum anime do usuário vence; hashtag sem
 * correspondência é ignorada (não é erro, só não resolve nada). `null`
 * quando nenhuma hashtag do texto bate com nenhum anime da lista.
 *
 * Limitação aceita (achado real da revisão de código desta entrega): se
 * a pessoa tiver 2 animes cujo título normaliza pro MESMO slug (ex.:
 * mesmo título cadastrado 2x, ou títulos que só diferem em pontuação),
 * a hashtag não consegue distinguir os 2 — sempre resolve pro 1º da
 * lista. Mesma limitação que uma hashtag de rede social de verdade tem
 * (não dá pra hashtag-desambiguar 2 coisas de mesmo nome); o dropdown
 * antigo (Epic 25) não tinha esse problema, mas exigia escolher por
 * `id`, não por nome. */
export function resolveAnimeFromHashtags<T extends { titleRomaji: string }>(
  body: string,
  myAnime: T[]
): T | null {
  const slugs = extractHashtagSlugs(body);
  for (const slug of slugs) {
    const match = myAnime.find((a) => animeSlug(a.titleRomaji) === slug);
    if (match) return match;
  }
  return null;
}

/** Detecta se o cursor está bem no fim de uma hashtag em digitação — ex.:
 * corpo "oi #kai" com cursor em 7 devolve "kai" (a parte já digitada
 * depois do "#"); devolve `null` quando o cursor não está logo depois de
 * um "#" sem espaço/quebra de linha no meio (não tem mention ativa).
 * Usado pra decidir quando mostrar a lista de sugestões. */
export function findActiveHashtagQuery(body: string, cursorPos: number): string | null {
  const upToCursor = body.slice(0, cursorPos);
  const match = upToCursor.match(/#([a-zA-Z0-9]*)$/);
  return match ? match[1] : null;
}

/** Troca a hashtag em digitação (a que `findActiveHashtagQuery` achou)
 * pelo slug completo do anime escolhido na lista de sugestões, com um
 * espaço depois — devolve o novo texto e a posição de cursor logo após
 * esse espaço, pra caller poder reposicionar o cursor real do campo. */
export function insertHashtagSelection(
  body: string,
  cursorPos: number,
  slug: string
): { body: string; cursorPos: number } {
  const upToCursor = body.slice(0, cursorPos);
  const match = upToCursor.match(/#([a-zA-Z0-9]*)$/);
  if (!match) return { body, cursorPos };
  const hashStart = cursorPos - match[0].length;
  const inserted = `#${slug} `;
  const newBody = body.slice(0, hashStart) + inserted + body.slice(cursorPos);
  return { body: newBody, cursorPos: hashStart + inserted.length };
}
