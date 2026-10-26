/**
 * Endereço da página de uma obra. Com AniList ID: `/anime/<anilistId>`. Sem ele (obra só do AniDB ou da Kitsu), a página
 * mora em `/anime/anidb-<id>` ou `/anime/kitsu-<id>` — o mesmo identificador que o Explorar já usa como chave do cartão —
 * e, quando a obra é ligada à AniList, esse endereço passa a redirecionar para o da AniList.
 */
export const CATALOG_ONLY_SLUG = /^(anidb|kitsu)-(\d{1,9})$/;

export function catalogSlug(work: { kitsuId?: number | null; anidbId?: number | null }): string | null {
  if (work.kitsuId) return `kitsu-${work.kitsuId}`;
  if (work.anidbId) return `anidb-${work.anidbId}`;
  return null;
}

export function workHref(work: { anilistId: number | null; kitsuId?: number | null; anidbId?: number | null; key?: string }): string | null {
  if (work.anilistId !== null) return `/anime/${work.anilistId}`;
  const slug = work.key && CATALOG_ONLY_SLUG.test(work.key) ? work.key : catalogSlug(work);
  return slug ? `/anime/${slug}` : null;
}
