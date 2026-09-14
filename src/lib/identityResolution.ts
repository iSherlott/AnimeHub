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
