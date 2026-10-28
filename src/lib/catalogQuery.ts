/** Palavras-chave e faixas de "Mais filtros" do Explorar (o servidor aplica; a busca ao vivo também respeita). */
export const EMPTY_KEYWORDS = { titleHas: "", synopsisHas: "", exclude: "", epMin: "", epMax: "", minScore: "" };
export type KeywordFilters = typeof EMPTY_KEYWORDS;

export type CatalogQueryInput = {
  /** Busca por título (só conta com 2+ letras; vazia fora do modo de busca). */
  q: string;
  genre: string;
  status: string;
  season: string;
  year: string;
  kind: string;
  availability: string;
  sort: string;
  keywords: KeywordFilters;
};

/**
 * A consulta do catálogo paginado do Explorar como texto de URL (`/api/catalog/page?<isto>`). É também a identidade da
 * consulta na rolagem infinita: a página do servidor e a tela montam o mesmo texto para a mesma escolha de filtros.
 */
export function catalogQueryString(input: CatalogQueryInput): string {
  const params = new URLSearchParams();
  const values: Record<string, string> = { q: input.q, genre: input.genre, status: input.status, season: input.season, year: input.year, kind: input.kind, availability: input.availability, sort: input.sort, ...input.keywords };
  for (const [key, value] of Object.entries(values)) if (value.trim()) params.set(key, value.trim());
  return params.toString();
}
