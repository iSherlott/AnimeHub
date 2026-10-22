import { isMainLine } from "./kind";

/**
 * Linha do tempo de cada franquia (Epic 45). Agrupa as obras ligadas entre si (sequência, spin-off, OVA, filme…) e põe todas
 * em ordem cronológica, dizendo o papel de cada uma: MAIN (a série da linha principal, com o número da temporada), RELATED
 * (outra série ligada, como um spin-off) ou SPECIAL (OVA, ODA, filme e outros, que não fazem parte da linha obrigatória).
 * Função pura sobre as relações da AniList guardadas no catálogo.
 */
export type OrderNode = {
  anilistId: number;
  kind: string | null;
  /** Data de estreia em milissegundos, se conhecida. */
  startDate: number | null;
  season: string | null;
  seasonYear: number | null;
  relations: ReadonlyArray<{ id: number; relationType: string }>;
};

export type Role = "MAIN" | "RELATED" | "SPECIAL";

export type Placement = {
  anilistId: number;
  /** Menor anilistId da franquia. */
  franchiseKey: number;
  /** 1 = a mais antiga da franquia. */
  order: number;
  role: Role;
  /** Temporada na linha principal (só MAIN). */
  season: number | null;
  /** Sem data de estreia nem temporada: ficou no fim da franquia, fora de ordem garantida. */
  undated: boolean;
  /** Contradiz a ordem das relações (uma sequência que estreou antes do prequel): detalhe para a pendência. */
  conflict: string | null;
};

export type Franchise = { key: number; members: Placement[] };

/** Relações que contam como "a mesma história" para agrupar a franquia (personagem e "outro" ficam de fora: ligam universos). */
const STORY = new Set(["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SUMMARY", "SPIN_OFF", "ALTERNATIVE", "FULL_STORY", "COMPILATION", "CONTAINS"]);
const SEASON_INDEX: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
/** Diferença aceita entre as datas de prequel e sequência (a AniList às vezes guarda só a temporada). */
const CONFLICT_TOLERANCE_MS = 100 * 24 * 3600 * 1000;

export function sortKey(node: Pick<OrderNode, "startDate" | "season" | "seasonYear">): number | null {
  if (node.startDate !== null) return node.startDate;
  if (node.seasonYear !== null) return Date.UTC(node.seasonYear, (SEASON_INDEX[node.season ?? ""] ?? 0) * 3, 1);
  return null;
}

class Groups {
  private parent = new Map<number, number>();
  add(id: number) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }
  find(id: number): number {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as number;
    let walk = id;
    while (walk !== root) {
      const next = this.parent.get(walk) as number;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }
}

const byDate = (keys: ReadonlyMap<number, number | null>) => (a: number, b: number) => {
  const ka = keys.get(a) ?? null;
  const kb = keys.get(b) ?? null;
  if (ka !== null && kb !== null && ka !== kb) return ka - kb;
  if (ka === null && kb !== null) return 1;
  if (ka !== null && kb === null) return -1;
  return a - b;
};

/** Todas as franquias do catálogo, maiores primeiro (a ordem em que o painel as percorre). Relações para obras fora do catálogo são ignoradas. */
export function placeFranchises(nodes: ReadonlyArray<OrderNode>): Franchise[] {
  const byId = new Map(nodes.map((n) => [n.anilistId, n]));
  const keys = new Map(nodes.map((n) => [n.anilistId, sortKey(n)]));
  const groups = new Groups();
  for (const node of nodes) groups.add(node.anilistId);

  // Pares prequel → sequência (dos dois lados da relação) e grupos de franquia.
  const sequels = new Set<string>();
  const chain = new Groups();
  for (const node of nodes) {
    chain.add(node.anilistId);
    for (const rel of node.relations) {
      if (!byId.has(rel.id) || rel.id === node.anilistId || !STORY.has(rel.relationType)) continue;
      groups.union(node.anilistId, rel.id);
      if (rel.relationType === "SEQUEL") sequels.add(`${node.anilistId}>${rel.id}`);
      else if (rel.relationType === "PREQUEL") sequels.add(`${rel.id}>${node.anilistId}`);
    }
  }
  for (const pair of sequels) {
    const [pre, post] = pair.split(">").map(Number);
    if (isMainLine(byId.get(pre)?.kind) && isMainLine(byId.get(post)?.kind)) chain.union(pre, post);
  }

  // Sequência que estreou antes do prequel: as datas contradizem as relações.
  const conflicts = new Map<number, string>();
  for (const pair of sequels) {
    const [pre, post] = pair.split(">").map(Number);
    const kpre = keys.get(pre) ?? null;
    const kpost = keys.get(post) ?? null;
    // Só entre séries: um OVA ou filme "prequel" costuma ser uma ordem da história, não um erro de data.
    if (!isMainLine(byId.get(pre)?.kind) || !isMainLine(byId.get(post)?.kind)) continue;
    if (kpre !== null && kpost !== null && kpost < kpre - CONFLICT_TOLERANCE_MS) conflicts.set(post, `estreou antes do prequel (AniList ${pre})`);
  }

  const members = new Map<number, number[]>();
  for (const node of nodes) {
    const root = groups.find(node.anilistId);
    members.set(root, [...(members.get(root) ?? []), node.anilistId]);
  }

  const franchises: Franchise[] = [];
  for (const [key, ids] of members) {
    const sorted = [...ids].sort(byDate(keys));

    // Linha principal: a maior corrente de séries ligadas por prequel/sequência (empate: a que começou primeiro).
    const chains = new Map<number, number[]>();
    for (const id of sorted) if (isMainLine(byId.get(id)?.kind)) chains.set(chain.find(id), [...(chains.get(chain.find(id)) ?? []), id]);
    const principal = [...chains.values()].sort((a, b) => b.length - a.length || byDate(keys)(a[0], b[0]))[0] ?? [];
    const mainSeason = new Map(principal.map((id, index) => [id, index + 1]));

    const placed: Placement[] = sorted.map((id, index) => {
      const node = byId.get(id) as OrderNode;
      const role: Role = mainSeason.has(id) ? "MAIN" : isMainLine(node.kind) ? "RELATED" : "SPECIAL";
      return { anilistId: id, franchiseKey: key, order: index + 1, role, season: mainSeason.get(id) ?? null, undated: keys.get(id) === null, conflict: conflicts.get(id) ?? null };
    });
    franchises.push({ key, members: placed });
  }
  return franchises.sort((a, b) => b.members.length - a.members.length || a.key - b.key);
}
