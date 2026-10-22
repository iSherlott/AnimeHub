/**
 * Obras repetidas no catálogo (Epic 45). Há dois casos:
 *
 * - **Mesma obra vinda de duas fontes**: uma entrada só do AniDB e outra da AniList com algum título igual depois de tirar
 *   maiúsculas, acentos e pontuação ("ID:INDEED" e "ID: INDEED"), do mesmo tipo e de anos próximos.
 * - **Duas entradas da mesma fonte**: a AniList (ou o AniDB) já decidiu que são obras diferentes, então só vale título
 *   principal ou em inglês idêntico (mantida a pontuação: "NEW GAME!" e "NEW GAME!!" são temporadas diferentes), mesmo tipo e
 *   mesmo ano.
 *
 * Obras ligadas entre si por relação (prequel, remake…) não contam. A função só aponta; juntar duas obras é decisão de uma
 * pessoa. O id da MyAnimeList não é usado: a AniList reaproveita o mesmo id em várias partes de uma obra.
 */
export type DuplicateInput = {
  id: string;
  anilistId: number | null;
  anidbId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  kind: string | null;
  /** Ano de estreia, se conhecido. */
  year: number | null;
  /** anilistId das obras ligadas a esta pela AniList. */
  related: ReadonlySet<number>;
};

export type DuplicateMatch = { otherId: string; reason: string };

const MAX_KEY_GROUP = 30;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

const enough = (key: string) => key !== "" && !/^\d+$/.test(key) && (key.length >= 4 || (CJK.test(key) && key.length >= 2));

/** Sem maiúsculas, acentos e pontuação ("Fullmetal Alchemist: Brotherhood!" → "fullmetalalchemistbrotherhood"). */
export function normalizeTitle(text: string | null): string | null {
  if (!text) return null;
  const key = text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return enough(key) ? key : null;
}

/** Sem maiúsculas, acentos e espaços repetidos, mas com a pontuação. */
export function strictTitle(text: string | null): string | null {
  if (!text) return null;
  const key = text.normalize("NFKC").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  return enough(key.replace(/[^\p{L}\p{N}]/gu, "")) ? key : null;
}

const label = (e: DuplicateInput) => `«${e.titleRomaji}» (${e.anilistId !== null ? `AniList ${e.anilistId}` : e.anidbId !== null ? `AniDB ${e.anidbId}` : "sem id"})`;

/** Por obra, com quem ela parece repetida e por quê. Só entram as obras que têm alguma suspeita. */
export function findDuplicates(entries: ReadonlyArray<DuplicateInput>): Map<string, DuplicateMatch[]> {
  const loose = new Map<string, number[]>();
  const strict = new Map<string, number[]>();
  const push = (map: Map<string, number[]>, key: string | null, index: number) => {
    if (key !== null) map.set(key, [...(map.get(key) ?? []), index]);
  };
  entries.forEach((entry, index) => {
    for (const key of new Set([entry.titleRomaji, entry.titleEnglish, entry.titleNative].map(normalizeTitle))) push(loose, key, index);
    for (const key of new Set([entry.titleRomaji, entry.titleEnglish].map(strictTitle))) push(strict, key, index);
  });

  const reasons = new Map<string, string>();
  const linked = (a: DuplicateInput, b: DuplicateInput) => (b.anilistId !== null && a.related.has(b.anilistId)) || (a.anilistId !== null && b.related.has(a.anilistId));
  const consider = (i: number, j: number, crossSource: boolean, wanted: boolean) => {
    const a = entries[i];
    const b = entries[j];
    if (wanted !== crossSource || linked(a, b)) return;
    if (a.kind !== null && b.kind !== null && a.kind !== b.kind) return;
    if (a.year !== null && b.year !== null && Math.abs(a.year - b.year) > 1) return;
    const reason = a.year !== null && b.year !== null ? "mesmo título e ano" : "mesmo título (ano desconhecido em uma delas)";
    reasons.set(i < j ? `${i}:${j}` : `${j}:${i}`, crossSource ? `${reason}, vindas de fontes diferentes` : reason);
  };
  const pairs = (map: Map<string, number[]>, crossSource: boolean) => {
    for (const indexes of map.values()) {
      if (indexes.length < 2 || indexes.length > MAX_KEY_GROUP) continue;
      for (let i = 0; i < indexes.length; i += 1) {
        for (let j = i + 1; j < indexes.length; j += 1) {
          const cross = (entries[indexes[i]].anilistId === null) !== (entries[indexes[j]].anilistId === null);
          consider(indexes[i], indexes[j], cross, crossSource);
        }
      }
    }
  };
  pairs(loose, true);
  pairs(strict, false);

  const result = new Map<string, DuplicateMatch[]>();
  for (const [pair, reason] of reasons) {
    const [lo, hi] = pair.split(":").map(Number);
    const a = entries[lo];
    const b = entries[hi];
    result.set(a.id, [...(result.get(a.id) ?? []), { otherId: b.id, reason: `${reason} — ${label(b)}` }]);
    result.set(b.id, [...(result.get(b.id) ?? []), { otherId: a.id, reason: `${reason} — ${label(a)}` }]);
  }
  return result;
}

/** Quantos grupos de obras repetidas há (obras ligadas por suspeita contam como um grupo só). */
export function countDuplicateGroups(matches: ReadonlyMap<string, DuplicateMatch[]>): number {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  for (const [id, list] of matches) for (const { otherId } of list) parent.set(find(id), find(otherId));
  return new Set([...matches.keys()].map(find)).size;
}
