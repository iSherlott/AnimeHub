import { prisma } from "@/lib/prisma";
import { CATALOG_ONLY_SLUG, catalogSlug } from "@/lib/workHref";

/**
 * A obra de que a comunidade fala (publicações, comentários, # da obra, quiz): pelo AniList ID ou, para a obra sem ele
 * (só do AniDB/Kitsu), pela obra do catálogo. Nunca os dois "valendo" ao mesmo tempo: com AniList ID, é ele que conta.
 */
export type WorkRef = { anilistId: number; catalogEntryId: null } | { anilistId: null; catalogEntryId: string };

/** Uma obra resolvida a partir da chave usada nos endereços: o AniList ID ou `anidb-<id>`/`kitsu-<id>`. */
export type ResolvedWork = WorkRef & {
  /** A chave como aparece nos endereços (`/anime/<key>`, `/obra/<key>/quiz`). */
  key: string;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
};

export const anilistRef = (anilistId: number): WorkRef => ({ anilistId, catalogEntryId: null });

/** A referência de uma linha que tem os dois campos (o AniList ID vale quando existe). */
export function refOf(row: { anilistId: number | null; catalogEntryId?: string | null }): WorkRef | null {
  if (row.anilistId !== null) return anilistRef(row.anilistId);
  return row.catalogEntryId ? { anilistId: null, catalogEntryId: row.catalogEntryId } : null;
}

/** Filtro do Prisma para "desta obra" (vale para Post, Comment, Hashtag e Quiz). */
export function workWhere(ref: WorkRef): { anilistId: number } | { anilistId: null; catalogEntryId: string } {
  return ref.anilistId !== null ? { anilistId: ref.anilistId } : { anilistId: null, catalogEntryId: ref.catalogEntryId };
}

/** A chave de endereço de uma referência (o AniList ID, ou a chave do catálogo). */
export async function keyOfRef(ref: WorkRef): Promise<string | null> {
  if (ref.anilistId !== null) return String(ref.anilistId);
  const entry = await prisma.catalogEntry.findUnique({ where: { id: ref.catalogEntryId }, select: { anidbId: true, kitsuId: true } });
  return entry ? catalogSlug(entry) : null;
}

/**
 * Resolve a chave de endereço. Número = obra da AniList (dados da produção ou do catálogo); `anidb-<id>`/`kitsu-<id>` =
 * obra do catálogo na plataforma — e, se ela já foi ligada à AniList, vale o AniList ID. Chave inválida ou obra
 * desconhecida = null.
 */
export async function resolveWorkKey(raw: string | number | null | undefined): Promise<ResolvedWork | null> {
  if (raw === null || raw === undefined) return null;
  const key = String(raw).trim();
  if (/^\d{1,9}$/.test(key) && Number(key) > 0) {
    const anilistId = Number(key);
    const [production, catalog] = await Promise.all([
      prisma.production.findUnique({ where: { anilistId }, select: { titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } }),
      prisma.catalogEntry.findUnique({ where: { anilistId }, select: { titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } }),
    ]);
    const work = production ?? catalog;
    return work ? { anilistId, catalogEntryId: null, key, ...work } : null;
  }
  const slug = CATALOG_ONLY_SLUG.exec(key);
  if (!slug || Number(slug[2]) <= 0) return null;
  const sourceId = Number(slug[2]);
  const entry = await prisma.catalogEntry.findUnique({ where: slug[1] === "anidb" ? { anidbId: sourceId } : { kitsuId: sourceId } });
  if (!entry || !entry.onPlatform) return null;
  const titles = { titleRomaji: entry.titleRomaji, titleEnglish: entry.titleEnglish, titleNative: entry.titleNative, coverImage: entry.coverImage };
  if (entry.anilistId !== null) return { anilistId: entry.anilistId, catalogEntryId: null, key: String(entry.anilistId), ...titles };
  return { anilistId: null, catalogEntryId: entry.id, key, ...titles };
}

/** Chave de endereço de cada obra do catálogo (para montar links de publicações, títulos, quizzes em lote). */
export async function catalogKeys(catalogEntryIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set(catalogEntryIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.catalogEntry.findMany({ where: { id: { in: ids } }, select: { id: true, anilistId: true, anidbId: true, kitsuId: true } });
  const out = new Map<string, string>();
  for (const r of rows) {
    const key = r.anilistId !== null ? String(r.anilistId) : catalogSlug(r);
    if (key) out.set(r.id, key);
  }
  return out;
}
