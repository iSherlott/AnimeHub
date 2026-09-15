import { normalizeGenres } from "@/lib/genreTaxonomy";

/**
 * Funções puras (sem I/O) que consolidam a lógica de "identidade" hoje
 * espalhada pelo BFF: fusão de gêneros de múltiplas fontes e escolha de
 * título por idioma da AniDB (usadas por src/lib/refreshAnimeData.ts) e
 * deduplicação por título normalizado (equivalente ao `dedupeByTitle` de
 * src/lib/catalogCache.ts). `deriveSeriesInfo` continua em
 * src/lib/series.ts, já pura e já reaproveitada por import direto.
 *
 * Vive em src/lib (não em services/name-resolver) porque é usada dos dois
 * lados da mesma chamada: é a implementação por trás do endpoint
 * /resolve-identity do name-resolver E o fallback local de quem chama esse
 * endpoint, caso o serviço esteja fora do ar — código compartilhado, não
 * duplicado nos dois lugares.
 */

/**
 * União sem duplicatas de gêneros de várias fontes com o que já existe.
 * Também normaliza pro vocabulário fechado (src/lib/genreTaxonomy.ts) — as
 * fontes (jikanMatch.genres etc.) já chegam normalizadas, mas `existing`
 * pode ser uma linha do banco gravada antes do Epic 3 existir; rodar por
 * aqui de novo a cada refresh vai limpando esse dado antigo sozinho, sem
 * precisar de uma migração de backfill à parte.
 */
export function mergeGenres(existing: string[], incoming: string[][]): string[] {
  // normalizeGenres já deduplica a saída — não precisa de um Set próprio
  // só pra juntar as listas primeiro.
  return normalizeGenres([existing, ...incoming].flat());
}

export type AnidbTitleCandidate = { language: string; title: string };

/** Mesma seleção por código de idioma que o refresh route fazia inline. */
export function pickAnidbTitles(titles: AnidbTitleCandidate[]): {
  pt: string | null;
  ja: string | null;
  en: string | null;
} {
  return {
    pt: titles.find((t) => t.language.startsWith("pt"))?.title ?? null,
    ja: titles.find((t) => t.language === "ja")?.title ?? null,
    en: titles.find((t) => t.language === "en")?.title ?? null,
  };
}

function normalizeForComparison(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas de combinacao Unicode)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(normalizeForComparison(title).split(" ").filter(Boolean));
}

/**
 * Confere se um resultado de busca por título (Kitsu/Jikan/Shikimori — as
 * 3 fontes que fazem "busca por texto" e usam só o 1º resultado, sem
 * nenhum ID estável de referência) é plausivelmente o mesmo anime que foi
 * buscado, não só o resultado mais popular/melhor-rankeado da API pra uma
 * busca que não achou nada parecido de verdade.
 *
 * Sem isso, um título sem correspondência real na fonte (ex.: um nome
 * fictício de teste, ou um anime obscuro demais) podia "casar" com um
 * anime completamente diferente — a API de busca quase sempre devolve
 * *algum* resultado, só não necessariamente relevante — e esse resultado
 * errado era gravado por cima de capa/banner/sinopse do anime certo,
 * corrompendo silenciosamente o registro (achado real da 6ª rodada de
 * auditoria, Epic 18: abrir a página de um anime sem capa acabava
 * mostrando a arte e a sinopse de outro anime qualquer).
 *
 * Heurística proporcional (sem dependência nova): match exato normalizado,
 * ou um título contém o outro por inteiro (cobre subtítulos/temporadas,
 * ex. "Attack on Titan" vs "Attack on Titan: Final Season"), ou pelo menos
 * 60% de sobreposição de palavras (cobre pequena variação de romanização/
 * pontuação). Não precisa ser perfeito — só precisa rejeitar os casos
 * claramente errados.
 */
export function titlesLikelyMatch(
  query: string,
  candidates: (string | null | undefined)[]
): boolean {
  const queryNorm = normalizeForComparison(query);
  const queryTokens = titleTokens(query);
  if (!queryNorm || queryTokens.size === 0) return false;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const candidateNorm = normalizeForComparison(candidate);
    if (!candidateNorm) continue;

    if (queryNorm === candidateNorm) return true;
    // Contido "por inteiro" precisa respeitar fronteira de palavra — um
    // includes() cru em string crua deixava um título curto de verdade
    // (ex.: "Air", "K") "casar" com qualquer título mais longo que só por
    // acaso contivesse essas letras em sequência (ex.: "Fair Game"),
    // exatamente o tipo de falso positivo que essa função existe pra
    // evitar. Preenchendo com espaço nas pontas, o includes() só bate numa
    // sequência de palavras inteiras, nunca no meio de uma palavra.
    const paddedQuery = ` ${queryNorm} `;
    const paddedCandidate = ` ${candidateNorm} `;
    if (paddedQuery.includes(paddedCandidate) || paddedCandidate.includes(paddedQuery)) return true;

    const candidateTokens = titleTokens(candidate);
    const overlap = [...queryTokens].filter((t) => candidateTokens.has(t)).length;
    const ratio = overlap / Math.max(queryTokens.size, candidateTokens.size);
    if (ratio >= 0.6) return true;
  }
  return false;
}

export type DedupeCandidate = { key: string; title: string; hasAnilistId: boolean };

/**
 * Mesma preferência do `dedupeByTitle` original (catalogCache.ts): entre
 * candidatos com o mesmo título normalizado (trim + lowercase), mantém o que
 * já tem anilistId (fonte mais completa); em empate, o primeiro visto vence.
 * Retorna as `key`s dos candidatos que devem ser mantidos.
 */
export function dedupeByNormalizedTitle(candidates: DedupeCandidate[]): string[] {
  const byTitle = new Map<string, DedupeCandidate>();
  for (const candidate of candidates) {
    const normalized = candidate.title.trim().toLowerCase();
    const existing = byTitle.get(normalized);
    if (!existing || (!existing.hasAnilistId && candidate.hasAnilistId)) {
      byTitle.set(normalized, candidate);
    }
  }
  return [...byTitle.values()].map((c) => c.key);
}
