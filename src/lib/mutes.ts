import { prisma } from "@/lib/prisma";
import { canonicalHashtagKey } from "@/lib/hashtags";

/**
 * Silenciar no Feed (12/11/2026): "não quero ver nada de Frieren até eu alcançar". A pessoa silencia uma obra (pela chave
 * da página: AniList ID ou `anidb-<id>`/`kitsu-<id>`) ou uma # (pela chave da hashtag). As publicações sobre ela — e os
 * reposts delas — somem das três abas do Feed. A página da obra e a da # continuam mostrando tudo: lá a pessoa foi atrás.
 */
export const MUTE_KINDS = ["WORK", "TAG"] as const;
export type MuteKind = (typeof MUTE_KINDS)[number];
export const MAX_MUTES = 200;

export type MuteInput = { kind?: unknown; key?: unknown; label?: unknown };

export function parseMute(input: MuteInput): { kind: MuteKind; key: string; label: string } | null {
  const kind = typeof input.kind === "string" && (MUTE_KINDS as readonly string[]).includes(input.kind) ? (input.kind as MuteKind) : null;
  const rawKey = typeof input.key === "string" ? input.key.trim() : "";
  if (!kind || !rawKey) return null;
  const key = kind === "TAG" ? canonicalHashtagKey(rawKey.replace(/^#/, "")) : rawKey;
  if (!key || key.length > 100) return null;
  if (kind === "WORK" && !/^(\d+|anidb-\d+|kitsu-\d+)$/.test(key)) return null;
  const label = (typeof input.label === "string" ? input.label.trim() : "").slice(0, 120) || (kind === "TAG" ? `#${key}` : key);
  return { kind, key, label };
}

export async function listMutes(userId: string) {
  return prisma.mutedTopic.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { kind: true, key: true, label: true, createdAt: true } });
}

/** A chave da obra de uma publicação (a mesma da página da obra). */
function postWorkKey(p: { anilistId: number | null; catalogEntry: { anidbId: number | null; kitsuId: number | null } | null }): string | null {
  if (p.anilistId !== null) return String(p.anilistId);
  if (!p.catalogEntry) return null;
  return p.catalogEntry.kitsuId ? `kitsu-${p.catalogEntry.kitsuId}` : p.catalogEntry.anidbId ? `anidb-${p.catalogEntry.anidbId}` : null;
}

/** Tira da página do Feed o que a pessoa silenciou (a publicação ou, num repost, a original). */
export async function filterMuted<T extends { id: string; repostOfId: string | null }>(userId: string, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const mutes = await prisma.mutedTopic.findMany({ where: { userId }, select: { kind: true, key: true } });
  if (mutes.length === 0) return rows;
  const works = new Set(mutes.filter((m) => m.kind === "WORK").map((m) => m.key));
  const tags = new Set(mutes.filter((m) => m.kind === "TAG").map((m) => m.key));
  const ids = [...new Set(rows.flatMap((r) => [r.id, r.repostOfId]).filter((x): x is string => Boolean(x)))];
  const posts = await prisma.post.findMany({
    where: { id: { in: ids } },
    select: { id: true, anilistId: true, catalogEntry: { select: { anidbId: true, kitsuId: true } }, hashtags: { select: { hashtag: { select: { key: true } } } } },
  });
  const muted = new Set(
    posts
      .filter((p) => {
        const work = postWorkKey(p);
        return (work !== null && works.has(work)) || p.hashtags.some((h) => tags.has(h.hashtag.key));
      })
      .map((p) => p.id)
  );
  return rows.filter((r) => !muted.has(r.id) && !(r.repostOfId && muted.has(r.repostOfId)));
}
