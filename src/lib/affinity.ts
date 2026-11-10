import { prisma } from "@/lib/prisma";
import { blockRelation } from "@/lib/blocks";
import { workHref } from "@/lib/workHref";

/**
 * Afinidade entre duas pessoas (10/11/2026): "vocês têm 78% de gosto em comum". Só com listas visíveis (a da outra
 * pessoa precisa ser pública) e sem bloqueio. A conta junta duas coisas fáceis de explicar:
 *  - obras em comum: quantas das obras da lista MENOR também estão na outra (60% do número);
 *  - gêneros: o quanto as duas listas se parecem nos gêneros (40%).
 * Obras dropadas não contam (desistir não é gostar). Com menos de 3 obras em alguma lista, o número enganaria.
 */

export const MIN_WORKS_FOR_AFFINITY = 3;

export type AffinityWork = { key: string; title: string; titleEnglish: string | null; coverImage: string | null; href: string | null; genres: string[] };
export type AffinityResult =
  | { kind: "ok"; percent: number; common: AffinityWork[]; commonCount: number; onlyTheirs: AffinityWork[]; sharedGenres: string[] }
  | { kind: "small" }
  | { kind: "hidden" };

function genreVector(works: AffinityWork[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of works) for (const g of w.genres) out.set(g, (out.get(g) ?? 0) + 1);
  return out;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0);
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** A parte pura: as duas listas (sem as dropadas) → porcentagem e o que mostrar. */
export function computeAffinity(mine: AffinityWork[], theirs: AffinityWork[]): AffinityResult {
  if (mine.length < MIN_WORKS_FOR_AFFINITY || theirs.length < MIN_WORKS_FOR_AFFINITY) return { kind: "small" };
  const mineKeys = new Set(mine.map((w) => w.key));
  const common = theirs.filter((w) => mineKeys.has(w.key));
  const overlap = common.length / Math.min(mine.length, theirs.length);
  const a = genreVector(mine);
  const b = genreVector(theirs);
  const percent = Math.round(100 * (0.6 * overlap + 0.4 * cosine(a, b)));
  const sharedGenres = [...a.keys()]
    .filter((g) => b.has(g))
    .sort((x, y) => (a.get(y) ?? 0) + (b.get(y) ?? 0) - ((a.get(x) ?? 0) + (b.get(x) ?? 0)) || x.localeCompare(y, "pt-BR"))
    .slice(0, 3);
  return { kind: "ok", percent, common: common.slice(0, 6), commonCount: common.length, onlyTheirs: theirs.filter((w) => !mineKeys.has(w.key)).slice(0, 4), sharedGenres };
}

const splitGenres = (value: string | null) => (value ? value.split(",").map((g) => g.trim()).filter(Boolean) : []);

async function listFor(userId: string): Promise<AffinityWork[]> {
  const rows = await prisma.anime.findMany({
    where: { userId, OR: [{ watchState: null }, { watchState: { not: "DROPPED" } }] },
    orderBy: [{ userScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true, titleEnglish: true, coverImage: true, genres: true },
  });
  const seen = new Set<string>();
  const out: AffinityWork[] = [];
  for (const r of rows) {
    const key = r.anilistId !== null ? `a${r.anilistId}` : r.anidbId !== null ? `d${r.anidbId}` : r.kitsuId !== null ? `k${r.kitsuId}` : r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, title: r.titleRomaji, titleEnglish: r.titleEnglish, coverImage: r.coverImage, href: workHref(r), genres: splitGenres(r.genres) });
  }
  return out;
}

export async function loadAffinity(viewerId: string, targetId: string): Promise<AffinityResult> {
  if (viewerId === targetId) return { kind: "hidden" };
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { animeListPublic: true } });
  if (!target || !target.animeListPublic || (await blockRelation(viewerId, targetId)) !== "none") return { kind: "hidden" };
  const [mine, theirs] = await Promise.all([listFor(viewerId), listFor(targetId)]);
  return computeAffinity(mine, theirs);
}
