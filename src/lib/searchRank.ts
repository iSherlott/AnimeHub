/**
 * Relevância da busca por título (Explorar e seletor de obra): o título igual à busca vem primeiro, depois os que começam
 * com ela, depois os que têm uma palavra começando com ela e, por fim, os que só contêm o trecho. Empates: mais popular
 * (menor posição no ranking) e ordem alfabética.
 */
export type RankableTitle = {
  id: string;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  popularityRank: number | null;
};

/** 0 = igual, 1 = começa com, 2 = palavra começa com, 3 = contém, null = não casa. */
export function titleMatchTier(titles: ReadonlyArray<string | null | undefined>, needle: string): number | null {
  const wanted = needle.trim().toLowerCase();
  if (!wanted) return null;
  let best: number | null = null;
  for (const raw of titles) {
    if (!raw) continue;
    const title = raw.toLowerCase();
    const index = title.indexOf(wanted);
    if (index < 0) continue;
    const tier = title === wanted ? 0 : index === 0 ? 1 : /[\s\-:·]/.test(title[index - 1] ?? "") ? 2 : 3;
    if (best === null || tier < best) best = tier;
  }
  return best;
}

/** As obras que casam com a busca, da mais para a menos relevante. */
export function rankTitleMatches<T extends RankableTitle>(entries: readonly T[], needle: string): T[] {
  const scored: Array<{ entry: T; tier: number }> = [];
  for (const entry of entries) {
    const tier = titleMatchTier([entry.titleRomaji, entry.titleEnglish, entry.titleNative], needle);
    if (tier !== null) scored.push({ entry, tier });
  }
  return scored
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.entry.popularityRank ?? Number.MAX_SAFE_INTEGER) - (b.entry.popularityRank ?? Number.MAX_SAFE_INTEGER) ||
        a.entry.titleRomaji.localeCompare(b.entry.titleRomaji)
    )
    .map((s) => s.entry);
}
