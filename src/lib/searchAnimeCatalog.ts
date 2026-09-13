import { searchAnime } from "@/lib/anilist";
import { cacheAniListMedia, searchCachedCatalog } from "@/lib/catalogCache";
import { discoverItemFromAniList, discoverItemFromCatalogEntry } from "@/lib/discoverItem";
import type { DiscoverItem } from "@/lib/discoverItem";

const OTHER_SOURCES_DISABLED = process.env.DISABLE_OTHER_SOURCES === "true";

export type SearchResult = { results: DiscoverItem[]; cached: boolean; disabled?: boolean };

/**
 * Busca livre de anime (Descobrir): AniList ao vivo, cacheia o resultado; se
 * falhar, cai pro cache local; se não tiver nada nem lá, propaga o erro.
 * Extraído de src/app/api/anilist/search/route.ts pra ser chamado tanto
 * pelo serviço cache-updater (services/cache-updater, caminho principal)
 * quanto pelo fallback local da rota, quando o serviço estiver indisponível
 * — mesma lógica, um lugar só.
 */
export async function searchAnimeCatalog(query: string): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { results: [], cached: false };

  if (OTHER_SOURCES_DISABLED) {
    const cached = await searchCachedCatalog(q);
    return { results: cached.map(discoverItemFromCatalogEntry), cached: true, disabled: true };
  }

  try {
    const media = await searchAnime(q);
    await cacheAniListMedia(media);
    return { results: media.map(discoverItemFromAniList), cached: false };
  } catch (error) {
    console.error(error);
    const cached = await searchCachedCatalog(q);
    if (cached.length > 0) {
      return { results: cached.map(discoverItemFromCatalogEntry), cached: true };
    }
    throw error;
  }
}
