import { linkKey } from "@/lib/story/versions";
import { isMainLine } from "./kind";

/**
 * Linha do tempo de uma obra (Epic 42): a linha principal (episódios, uma entrada por temporada — e uma temporada pode ter
 * outro nome, como "Shippuuden") separada dos especiais (OVA, ODA, filmes), que são complementares e opcionais, e das séries
 * ligadas por spin-off. Função pura sobre as relações da AniList guardadas no catálogo.
 */
export type TimelineRelation = { id: number; relationType: string };

export type TimelineNode = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  kind: string | null;
  format: string | null;
  season: string | null;
  seasonYear: number | null;
  startDate: string | null;
  episodes: number | null;
  coverImage: string | null;
  relations: TimelineRelation[];
};

export type TimelineEntry = Omit<TimelineNode, "relations"> & {
  /** Nas séries da linha principal: 1, 2, 3… na ordem em que foram ao ar. */
  seasonNumber?: number;
  /** Como a obra se liga à principal (SIDE_STORY, SUMMARY, SPIN_OFF…); nos especiais e nas relacionadas. */
  relationType?: string;
  current: boolean;
};

export type FranchiseTimeline = {
  main: TimelineEntry[];
  /** OVA, ODA, filmes e outros: não fazem parte da linha obrigatória. */
  specials: TimelineEntry[];
  /** Outras séries ligadas (spin-offs, versões alternativas…). */
  related: TimelineEntry[];
};

const CHAIN = new Set(["PREQUEL", "SEQUEL"]);
const MAX_NODES = 80;
const SEASON_ORDER = ["WINTER", "SPRING", "SUMMER", "FALL"];

function order(a: TimelineNode, b: TimelineNode): number {
  const da = a.startDate ? Date.parse(a.startDate) : Number.NaN;
  const db = b.startDate ? Date.parse(b.startDate) : Number.NaN;
  if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db;
  const ea = a.seasonYear !== null ? a.seasonYear * 4 + Math.max(0, SEASON_ORDER.indexOf(a.season ?? "")) : Number.NaN;
  const eb = b.seasonYear !== null ? b.seasonYear * 4 + Math.max(0, SEASON_ORDER.indexOf(b.season ?? "")) : Number.NaN;
  if (!Number.isNaN(ea) && !Number.isNaN(eb) && ea !== eb) return ea - eb;
  return a.anilistId - b.anilistId;
}

const toEntry = (node: TimelineNode, rootId: number, extra: Partial<TimelineEntry> = {}): TimelineEntry => {
  const { relations: _relations, ...rest } = node;
  void _relations;
  return { ...rest, current: node.anilistId === rootId, ...extra };
};

/**
 * `nodes`: as obras do catálogo que se ligam à raiz (qualquer obra fora do catálogo é ignorada). Devolve null se a raiz
 * não está nele.
 */
export function buildTimeline(rootId: number, nodes: ReadonlyMap<number, TimelineNode>, excluded: ReadonlySet<string> = new Set()): FranchiseTimeline | null {
  const root = nodes.get(rootId);
  if (!root) return null;

  // Arestas nos dois sentidos, só entre obras do catálogo.
  const edges = new Map<number, Array<{ to: number; type: string }>>();
  const add = (from: number, to: number, type: string) => {
    if (!nodes.has(to) || from === to || excluded.has(linkKey(from, to))) return;
    const list = edges.get(from) ?? [];
    if (!list.some((e) => e.to === to && e.type === type)) list.push({ to, type });
    edges.set(from, list);
  };
  const REVERSE: Record<string, string> = { PREQUEL: "SEQUEL", SEQUEL: "PREQUEL" };
  for (const node of nodes.values()) {
    for (const rel of node.relations) {
      add(node.anilistId, rel.id, rel.relationType);
      add(rel.id, node.anilistId, REVERSE[rel.relationType] ?? rel.relationType);
    }
  }

  // Componente conectado a partir da raiz (limitado, para uma franquia gigante não travar a página).
  const seen = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length && seen.size < MAX_NODES) {
    const id = queue.shift() as number;
    for (const edge of edges.get(id) ?? []) {
      if (seen.has(edge.to) || seen.size >= MAX_NODES) continue;
      seen.add(edge.to);
      queue.push(edge.to);
    }
  }

  // Âncora da linha principal: a própria obra, se for série; senão a série mais próxima.
  let anchor: number | null = isMainLine(root.kind) ? rootId : null;
  if (anchor === null) {
    const bfs = [rootId];
    const visited = new Set<number>([rootId]);
    while (bfs.length && anchor === null) {
      const id = bfs.shift() as number;
      for (const edge of edges.get(id) ?? []) {
        if (visited.has(edge.to) || !seen.has(edge.to)) continue;
        visited.add(edge.to);
        if (isMainLine(nodes.get(edge.to)?.kind)) {
          anchor = edge.to;
          break;
        }
        bfs.push(edge.to);
      }
    }
  }

  // Linha principal: séries ligadas entre si só por PREQUEL/SEQUEL.
  const mainIds = new Set<number>();
  if (anchor !== null) {
    mainIds.add(anchor);
    const chain = [anchor];
    while (chain.length) {
      const id = chain.pop() as number;
      for (const edge of edges.get(id) ?? []) {
        if (!CHAIN.has(edge.type) || mainIds.has(edge.to) || !seen.has(edge.to) || !isMainLine(nodes.get(edge.to)?.kind)) continue;
        mainIds.add(edge.to);
        chain.push(edge.to);
      }
    }
  }

  const link = (id: number): string | undefined => {
    for (const other of [...mainIds, rootId]) {
      const found = (edges.get(id) ?? []).find((e) => e.to === other);
      if (found) return found.type;
    }
    return (edges.get(id) ?? [])[0]?.type;
  };

  const main = [...mainIds].map((id) => nodes.get(id) as TimelineNode).sort(order).map((node, index) => toEntry(node, rootId, { seasonNumber: index + 1 }));
  const rest = [...seen].filter((id) => !mainIds.has(id)).map((id) => nodes.get(id) as TimelineNode).sort(order);
  const specials = rest.filter((n) => !isMainLine(n.kind)).map((n) => toEntry(n, rootId, { relationType: link(n.anilistId) }));
  const related = rest.filter((n) => isMainLine(n.kind)).map((n) => toEntry(n, rootId, { relationType: link(n.anilistId) }));
  return { main, specials, related };
}

/** Resumo para o aviso da página: quantos especiais de cada tipo a obra tem ("2 OVA, 1 filme"). */
export function specialsSummary(specials: ReadonlyArray<Pick<TimelineEntry, "kind">>): Array<{ kind: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of specials) counts.set(s.kind ?? "OTHER", (counts.get(s.kind ?? "OTHER") ?? 0) + 1);
  const rank = ["OVA", "ODA", "MOVIE", "OTHER"];
  return [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind));
}
