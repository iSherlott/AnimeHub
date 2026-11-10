import { prisma } from "@/lib/prisma";

/**
 * Spoiler que se libera sozinho (10/11/2026, escolha do usuário: "por tempo desde a estreia"): o spoiler marcado
 * "até o episódio N" de uma obra abre para todo mundo `RELEASE_AFTER_DAYS` dias depois de o episódio N ir ao ar.
 * Só vale para spoiler com obra e episódio informados — "Spoiler" solto continua fechado. O aviso continua dizendo que
 * era spoiler ("liberado").
 */
export const RELEASE_AFTER_DAYS = 7;
const RELEASE_AFTER_MS = RELEASE_AFTER_DAYS * 24 * 3600 * 1000;

type SpoilerRef = { id: string; isSpoiler: boolean; spoilerEpisode: number | null; anilistId: number | null; catalogEntryId?: string | null };

/** Quando o episódio estreou: o horário, ou o dia (meia-noite UTC) quando a fonte só tem a data. */
export function episodeAiredAt(row: { airingAt: Date | null; airDate: Date | null }): Date | null {
  return row.airingAt ?? row.airDate ?? null;
}

/** A regra pura: estreou há pelo menos 7 dias. */
export function isSpoilerReleased(airedAt: Date | null, now: Date): boolean {
  return airedAt !== null && now.getTime() - airedAt.getTime() >= RELEASE_AFTER_MS;
}

/** Quais destes conteúdos (publicações, tópicos, respostas) já tiveram o spoiler liberado. */
export async function releasedSpoilerIds(items: SpoilerRef[], now = new Date()): Promise<Set<string>> {
  const candidates = items.filter((i) => i.isSpoiler && i.spoilerEpisode !== null && (i.anilistId !== null || i.catalogEntryId));
  if (candidates.length === 0) return new Set();
  const anilistIds = [...new Set(candidates.flatMap((c) => (c.anilistId !== null ? [c.anilistId] : [])))];
  const catalogIds = [...new Set(candidates.flatMap((c) => (c.anilistId === null && c.catalogEntryId ? [c.catalogEntryId] : [])))];
  const episodes = [...new Set(candidates.map((c) => c.spoilerEpisode as number))];
  const rows = await prisma.airingScheduleEntry.findMany({
    where: { status: "ACTIVE", episode: { in: episodes }, OR: [...(anilistIds.length ? [{ anilistId: { in: anilistIds } }] : []), ...(catalogIds.length ? [{ catalogEntryId: { in: catalogIds } }] : [])] },
    select: { anilistId: true, catalogEntryId: true, episode: true, airingAt: true, airDate: true },
  });
  const aired = new Map<string, Date>();
  for (const r of rows) {
    const at = episodeAiredAt(r);
    if (!at) continue;
    const key = r.anilistId !== null ? `a${r.anilistId}:${r.episode}` : `c${r.catalogEntryId}:${r.episode}`;
    const prev = aired.get(key);
    if (!prev || at < prev) aired.set(key, at);
  }
  const out = new Set<string>();
  for (const c of candidates) {
    const key = c.anilistId !== null ? `a${c.anilistId}:${c.spoilerEpisode}` : `c${c.catalogEntryId}:${c.spoilerEpisode}`;
    if (isSpoilerReleased(aired.get(key) ?? null, now)) out.add(c.id);
  }
  return out;
}

/** A obra de um tópico ou resposta (a do "Sobre" ou a da comunidade), no formato que `releasedSpoilerIds` espera. */
export async function topicSpoilerWork(catalogEntryId: string | null, rootWorkKey: string): Promise<{ anilistId: number | null; catalogEntryId: string | null }> {
  if (catalogEntryId) {
    const entry = await prisma.catalogEntry.findUnique({ where: { id: catalogEntryId }, select: { anilistId: true } });
    return { anilistId: entry?.anilistId ?? null, catalogEntryId };
  }
  if (/^\d+$/.test(rootWorkKey)) return { anilistId: Number(rootWorkKey), catalogEntryId: null };
  const slug = /^(anidb|kitsu)-(\d+)$/.exec(rootWorkKey);
  if (!slug) return { anilistId: null, catalogEntryId: null };
  const entry = await prisma.catalogEntry.findUnique({ where: slug[1] === "anidb" ? { anidbId: Number(slug[2]) } : { kitsuId: Number(slug[2]) }, select: { id: true, anilistId: true } });
  return { anilistId: entry?.anilistId ?? null, catalogEntryId: entry?.id ?? null };
}
