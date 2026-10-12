import { searchCachedCatalog } from "@/lib/catalogCache";
import { discoverItemFromCatalogEntry } from "@/lib/discoverItem";
import type { DiscoverItem } from "@/lib/discoverItem";

export type SearchResult = { results: DiscoverItem[]; cached: boolean; disabled?: boolean };

/**
 * Busca livre de anime (Descobrir): SÓ nas obras da plataforma. A AniList não é consultada ao buscar — o que não
 * foi trazido pelo admin (upload do HTML do AniDB; painel de importação da AniList) não aparece nem pode ser
 * acompanhado. Extraído de src/app/api/anilist/search/route.ts pra ser chamado pelo cache-updater e pela rota.
 */
export async function searchAnimeCatalog(query: string): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { results: [], cached: false };
  const cached = await searchCachedCatalog(q);
  return { results: cached.map(discoverItemFromCatalogEntry), cached: true };
}
