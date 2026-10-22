import { linkKey } from "./versions";

/**
 * Candidatos a reboot (Epic 48). A AniList liga duas séries como "versão alternativa" tanto quando uma é o reboot da outra
 * (Hunter x Hunter 1999 e 2011) quanto quando são só universos parecidos (as várias séries Precure). Por isso o nome e a sinopse
 * não decidem: esta lista é só a fila do que precisa ser pesquisado, um par por vez, em lotes. Quem decide é a pesquisa.
 */
export type CandidateEntry = {
  anilistId: number;
  titleRomaji: string;
  kind: string | null;
  seasonYear: number | null;
  episodes: number | null;
  popularityRank: number | null;
  relations: ReadonlyArray<{ id: number; relationType: string }>;
};

export type RebootCandidate = { key: string; a: CandidateEntry; b: CandidateEntry };

const rankOf = (c: RebootCandidate) => Math.min(c.a.popularityRank ?? Number.POSITIVE_INFINITY, c.b.popularityRank ?? Number.POSITIVE_INFINITY);

/**
 * Pares de séries (episódios) ligados como versão alternativa que ainda não foram pesquisados, das mais populares para as
 * menos (a pesquisa começa pelo que mais gente vê). `reviewed`: chaves (`linkKey`) dos pares já conferidos.
 */
export function findRebootCandidates(entries: ReadonlyArray<CandidateEntry>, reviewed: ReadonlySet<string>): RebootCandidate[] {
  const byId = new Map(entries.map((e) => [e.anilistId, e]));
  const seen = new Set<string>();
  const out: RebootCandidate[] = [];
  for (const a of entries) {
    if (a.kind !== "EPISODE") continue;
    for (const rel of a.relations) {
      if (rel.relationType !== "ALTERNATIVE") continue;
      const b = byId.get(rel.id);
      if (!b || b.kind !== "EPISODE" || b.anilistId === a.anilistId) continue;
      const key = linkKey(a.anilistId, b.anilistId);
      if (seen.has(key) || reviewed.has(key)) continue;
      seen.add(key);
      // O mais antigo primeiro: é a "versão antiga" do par.
      const [first, second] = (a.seasonYear ?? 9999) <= (b.seasonYear ?? 9999) ? [a, b] : [b, a];
      out.push({ key, a: first, b: second });
    }
  }
  return out.sort((x, y) => rankOf(x) - rankOf(y) || (x.a.seasonYear ?? 9999) - (y.a.seasonYear ?? 9999) || x.a.titleRomaji.localeCompare(y.a.titleRomaji));
}
