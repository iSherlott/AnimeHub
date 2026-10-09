/**
 * Resolução de franquia a partir das `relations` da AniList (PREQUEL/PARENT).
 *
 * Substitui a heurística por regex do título (`series.ts#deriveSeriesInfo`),
 * que cria uma franquia nova para "Attack on Titan: The Final Season",
 * "Sword Art Online: Alicization" etc. (auditoria Figma×PoC, TR-046).
 * Modelo do Figma (`8:3603`): Franchise → Production; o número da temporada
 * pertence à produção. Aprovado em D-18.
 */

export type RelatedMedia = {
  id: number;
  titleRomaji: string;
  format: string | null;
  relationType: string;
};

export type MediaRelations = {
  id: number;
  format: string | null;
  titleRomaji: string;
  /** Ids que vêm ANTES desta mídia (PREQUEL, ou PARENT quando não há PREQUEL). */
  predecessorIds: number[];
  /** Mídias de anime ligadas a esta (PREQUEL, SEQUEL, PARENT, SIDE_STORY…). */
  related?: RelatedMedia[];
};

export type FranchiseResolution = {
  /** Mídia mais antiga alcançável subindo pela cadeia — identifica a franquia. */
  rootId: number;
  rootTitleRomaji: string;
  /** Da raiz até a mídia inicial (inclusive). */
  chainIds: number[];
  /** 1 + quantas mídias de formato TV/TV_SHORT vêm antes na cadeia. */
  seasonNumber: number;
};

const SEASON_FORMATS = new Set(["TV", "TV_SHORT"]);
const MAX_HOPS = 30;

/**
 * `fetchRelations` devolve null quando a mídia não é encontrada (a cadeia
 * simplesmente termina ali). Ciclos e cadeias absurdamente longas são cortados.
 */
export async function resolveFranchise(
  startId: number,
  fetchRelations: (anilistId: number) => Promise<MediaRelations | null>
): Promise<FranchiseResolution> {
  const start = await fetchRelations(startId);
  if (!start) {
    return { rootId: startId, rootTitleRomaji: "", chainIds: [startId], seasonNumber: 1 };
  }

  const visited = new Set<number>([start.id]);
  const chain: MediaRelations[] = [start];
  let current = start;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const nextId = current.predecessorIds.find((id) => !visited.has(id));
    if (nextId === undefined) break;
    const next = await fetchRelations(nextId);
    if (!next) break;
    visited.add(next.id);
    chain.push(next);
    current = next;
  }

  chain.reverse(); // raiz primeiro
  const root = chain[0];
  const precedingSeasons = chain
    .slice(0, -1)
    .filter((media) => media.format && SEASON_FORMATS.has(media.format)).length;

  return {
    rootId: root.id,
    rootTitleRomaji: root.titleRomaji,
    chainIds: chain.map((media) => media.id),
    seasonNumber: 1 + precedingSeasons,
  };
}
