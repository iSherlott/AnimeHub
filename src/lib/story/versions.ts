/**
 * Versões de uma história (Epic 48). Um reboot liga duas versões da mesma história (a antiga e a refeita do zero); cada versão
 * tem a própria linha do tempo, e o que liga uma à outra é só esse vínculo. Para separar as linhas, a relação entre as duas
 * obras ligadas (a "versão alternativa" da AniList) deixa de contar como parte da mesma franquia.
 */
export const linkKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Os pares de obras que são versões uma da outra: a relação entre elas não junta as linhas do tempo. */
export function excludedEdges(links: ReadonlyArray<{ oldAnilistId: number; newAnilistId: number }>): Set<string> {
  return new Set(links.map((l) => linkKey(l.oldAnilistId, l.newAnilistId)));
}

export type ArcInfo = {
  position: number;
  nameEn: string;
  namePt: string | null;
  nameJa: string | null;
  startEpisode: number;
  endEpisode: number;
};

/** Arco que contém o episódio, se houver. */
export function arcOf(episode: number, arcs: ReadonlyArray<ArcInfo>): ArcInfo | null {
  return arcs.find((a) => episode >= a.startEpisode && episode <= a.endEpisode) ?? null;
}

/** Nome do arco no idioma de quem olha (cai para o inglês, que toda pesquisa traz). */
export function arcName(arc: Pick<ArcInfo, "nameEn" | "namePt" | "nameJa">, language: "pt" | "en" | "ja"): string {
  if (language === "pt") return arc.namePt ?? arc.nameEn;
  if (language === "ja") return arc.nameJa ?? arc.nameEn;
  return arc.nameEn;
}

/**
 * Põe os cabeçalhos dos arcos na lista de episódios (um antes do primeiro episódio de cada arco) e, no reboot que vai além da
 * versão antiga, o marcador do ponto em que isso começa (`beyondFromEpisode`, antes do cabeçalho do arco). Itens que não são
 * episódios (ramificações) seguem como estão, sem arco. A lista de entrada já vem em ordem.
 */
export function groupByArcs<E extends { number: number }, T>(
  items: ReadonlyArray<T>,
  episodeOf: (item: T) => E | null,
  arcs: ReadonlyArray<ArcInfo>,
  beyondFromEpisode: number | null
): Array<{ kind: "item"; item: T } | { kind: "arc"; arc: ArcInfo } | { kind: "beyond"; fromEpisode: number; arc: ArcInfo | null }> {
  const out: Array<{ kind: "item"; item: T } | { kind: "arc"; arc: ArcInfo } | { kind: "beyond"; fromEpisode: number; arc: ArcInfo | null }> = [];
  let currentArc: number | null = null;
  let beyondDone = beyondFromEpisode === null;
  for (const item of items) {
    const episode = episodeOf(item);
    if (episode) {
      const arc = arcOf(episode.number, arcs);
      if (!beyondDone && beyondFromEpisode !== null && episode.number >= beyondFromEpisode) {
        out.push({ kind: "beyond", fromEpisode: beyondFromEpisode, arc: arcOf(beyondFromEpisode, arcs) });
        beyondDone = true;
      }
      if (arc && arc.position !== currentArc) {
        out.push({ kind: "arc", arc });
        currentArc = arc.position;
      } else if (!arc) {
        currentArc = null;
      }
    }
    out.push({ kind: "item", item });
  }
  return out;
}
