import { prisma } from "@/lib/prisma";
import { blockRelation } from "@/lib/blocks";
import { computeAffinity, type AffinityWork } from "@/lib/affinity";

/**
 * Comparar listas com outra pessoa, lado a lado (12/11/2026): o que as duas acompanham (com a nota de cada uma, as maiores
 * diferenças primeiro), o que só você acompanha e o que só ela acompanha. Mesmas regras da afinidade: a lista da outra
 * pessoa precisa estar visível ("Mostrar meus animes") e não pode haver bloqueio. As dropadas ficam de fora.
 */
export type CompareWork = { key: string; title: string; coverImage: string | null; href: string | null; myScore: number | null; theirScore: number | null };
export type CompareResult =
  | { kind: "ok"; percent: number | null; common: CompareWork[]; onlyMine: CompareWork[]; onlyTheirs: CompareWork[] }
  | { kind: "hidden" }
  | { kind: "self" };

type Row = { key: string; title: string; coverImage: string | null; href: string | null; score: number | null; genres: string[] };

function workHref(r: { anilistId: number | null; anidbId: number | null; kitsuId: number | null }): string | null {
  return r.anilistId !== null ? `/anime/${r.anilistId}` : r.anidbId !== null ? `/anime/anidb-${r.anidbId}` : r.kitsuId !== null ? `/anime/kitsu-${r.kitsuId}` : null;
}

async function rowsFor(userId: string): Promise<Row[]> {
  const rows = await prisma.anime.findMany({
    where: { userId, OR: [{ watchState: null }, { watchState: { not: "DROPPED" } }] },
    select: { id: true, anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true, coverImage: true, userScore: true, genres: true },
  });
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = r.anilistId !== null ? `a${r.anilistId}` : r.anidbId !== null ? `d${r.anidbId}` : r.kitsuId !== null ? `k${r.kitsuId}` : r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, title: r.titleRomaji, coverImage: r.coverImage, href: workHref(r), score: r.userScore, genres: r.genres ? r.genres.split(",").map((g) => g.trim()).filter(Boolean) : [] });
  }
  return out;
}

const byTitle = (a: CompareWork, b: CompareWork) => a.title.localeCompare(b.title, "pt-BR");

/** A parte pura: as duas listas → as três colunas. Em comum: as notas mais diferentes primeiro (é onde está a conversa). */
export function compareRows(mine: Row[], theirs: Row[]): Omit<Extract<CompareResult, { kind: "ok" }>, "kind" | "percent"> {
  const theirsByKey = new Map(theirs.map((r) => [r.key, r]));
  const mineKeys = new Set(mine.map((r) => r.key));
  const common: CompareWork[] = [];
  const onlyMine: CompareWork[] = [];
  for (const m of mine) {
    const t = theirsByKey.get(m.key);
    const base = { key: m.key, title: m.title, coverImage: m.coverImage, href: m.href };
    if (t) common.push({ ...base, myScore: m.score, theirScore: t.score });
    else onlyMine.push({ ...base, myScore: m.score, theirScore: null });
  }
  const onlyTheirs = theirs.filter((t) => !mineKeys.has(t.key)).map((t) => ({ key: t.key, title: t.title, coverImage: t.coverImage, href: t.href, myScore: null, theirScore: t.score }));
  const gap = (w: CompareWork) => (w.myScore !== null && w.theirScore !== null ? Math.abs(w.myScore - w.theirScore) : -1);
  common.sort((a, b) => gap(b) - gap(a) || byTitle(a, b));
  return { common, onlyMine: onlyMine.sort(byTitle), onlyTheirs: onlyTheirs.sort(byTitle) };
}

export async function compareLists(viewerId: string, targetId: string): Promise<CompareResult> {
  if (viewerId === targetId) return { kind: "self" };
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { animeListPublic: true } });
  if (!target || !target.animeListPublic || (await blockRelation(viewerId, targetId)) !== "none") return { kind: "hidden" };
  const [mine, theirs] = await Promise.all([rowsFor(viewerId), rowsFor(targetId)]);
  const toAffinity = (rows: Row[]): AffinityWork[] => rows.map((r) => ({ key: r.key, title: r.title, titleEnglish: null, coverImage: r.coverImage, href: r.href, genres: r.genres }));
  const affinity = computeAffinity(toAffinity(mine), toAffinity(theirs));
  return { kind: "ok", percent: affinity.kind === "ok" ? affinity.percent : null, ...compareRows(mine, theirs) };
}
