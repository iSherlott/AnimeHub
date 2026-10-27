import { prisma } from "@/lib/prisma";
import { isBlank } from "@/lib/text";
import { loadProfileAnimeList, type ProfileAnimeEntry } from "@/lib/profileAnimeList";
import { workHref, catalogSlug } from "@/lib/workHref";
import type { WatchCategory } from "@/lib/watchCategory";

/**
 * Álbuns do perfil: coletâneas de animes (não há fotos). Os automáticos vêm do andamento de cada obra (Assistindo,
 * Terminei, Não terminei, Dropei); os personalizados a pessoa monta com obras da própria lista. Quem vê segue
 * "Mostrar meus animes" (a própria pessoa sempre vê os seus), e bloqueio esconde tudo.
 */
export const AUTO_ALBUMS = [
  { slug: "assistindo", category: "watching", name: "Assistindo" },
  { slug: "terminei", category: "finished", name: "Terminei" },
  { slug: "nao-terminei", category: "unfinished", name: "Não terminei" },
  { slug: "dropei", category: "dropped", name: "Dropei" },
] as const satisfies ReadonlyArray<{ slug: string; category: Exclude<WatchCategory, "other">; name: string }>;

export const ALBUM_NAME_MAX = 60;
export const ALBUM_DESCRIPTION_MAX = 300;
export const MAX_ALBUMS = 30;
export const MAX_ALBUM_ITEMS = 200;
const COVERS = 4;

export type AlbumError = { ok: false; status: 400 | 403 | 404 | 409; error: string };
export type AlbumCard = { key: string; name: string; count: number; covers: string[]; auto: boolean };
export type AlbumWork = { animeId: string | null; key: string; href: string | null; titleRomaji: string; titleEnglish: string | null; titleNative: string | null; coverImage: string | null };

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function validate(input: unknown, partial: boolean): { ok: true; value: { name?: string; description?: string | null } } | AlbumError {
  const body = (input ?? {}) as Record<string, unknown>;
  const value: { name?: string; description?: string | null } = {};
  if (!partial || "name" in body) {
    const name = clean(body.name);
    if (isBlank(name) || name.length > ALBUM_NAME_MAX) return { ok: false, status: 400, error: `Nome do álbum de 1 a ${ALBUM_NAME_MAX} caracteres.` };
    if (AUTO_ALBUMS.some((a) => a.name.toLowerCase() === name.toLowerCase())) return { ok: false, status: 400, error: "Esse nome é de um álbum automático. Escolha outro." };
    value.name = name;
  }
  if ("description" in body) {
    const description = clean(body.description);
    if (description.length > ALBUM_DESCRIPTION_MAX) return { ok: false, status: 400, error: `Descrição com até ${ALBUM_DESCRIPTION_MAX} caracteres.` };
    value.description = description || null;
  }
  return { ok: true, value };
}

export async function createAlbum(userId: string, input: unknown): Promise<{ ok: true; id: string } | AlbumError> {
  const parsed = validate(input, false);
  if (!parsed.ok) return parsed;
  if ((await prisma.profileAlbum.count({ where: { userId } })) >= MAX_ALBUMS) return { ok: false, status: 409, error: `Limite de ${MAX_ALBUMS} álbuns.` };
  const album = await prisma.profileAlbum.create({ data: { userId, name: parsed.value.name as string, description: parsed.value.description ?? null }, select: { id: true } });
  return { ok: true, id: album.id };
}

async function ownAlbum(albumId: string, userId: string): Promise<AlbumError | null> {
  const album = await prisma.profileAlbum.findUnique({ where: { id: albumId }, select: { userId: true } });
  if (!album) return { ok: false, status: 404, error: "Álbum não encontrado." };
  if (album.userId !== userId) return { ok: false, status: 403, error: "Só o dono do perfil mexe nos álbuns dele." };
  return null;
}

export async function updateAlbum(albumId: string, userId: string, input: unknown): Promise<{ ok: true } | AlbumError> {
  const denied = await ownAlbum(albumId, userId);
  if (denied) return denied;
  const parsed = validate(input, true);
  if (!parsed.ok) return parsed;
  if (Object.keys(parsed.value).length === 0) return { ok: false, status: 400, error: "Nada para atualizar." };
  await prisma.profileAlbum.update({ where: { id: albumId }, data: parsed.value });
  return { ok: true };
}

export async function deleteAlbum(albumId: string, userId: string): Promise<{ ok: true } | AlbumError> {
  const denied = await ownAlbum(albumId, userId);
  if (denied) return denied;
  await prisma.profileAlbum.delete({ where: { id: albumId } });
  return { ok: true };
}

/** Colocar uma obra no álbum: só obras da lista da própria pessoa. */
export async function addAlbumItem(albumId: string, userId: string, animeId: unknown): Promise<{ ok: true } | AlbumError> {
  const denied = await ownAlbum(albumId, userId);
  if (denied) return denied;
  const anime = typeof animeId === "string" ? await prisma.anime.findUnique({ where: { id: animeId }, select: { userId: true, seriesKey: true, anilistId: true } }) : null;
  if (!anime || anime.userId !== userId) return { ok: false, status: 400, error: "Só dá para colocar no álbum obras da sua lista." };
  // A mesma obra (outra temporada) já está no álbum?
  if (anime.seriesKey && (await prisma.profileAlbumItem.count({ where: { albumId, animeId: { not: animeId as string }, anime: { seriesKey: anime.seriesKey } } })) > 0) return { ok: false, status: 409, error: "Essa obra já está no álbum." };
  if ((await prisma.profileAlbumItem.count({ where: { albumId } })) >= MAX_ALBUM_ITEMS) return { ok: false, status: 409, error: `Limite de ${MAX_ALBUM_ITEMS} obras por álbum.` };
  await prisma.profileAlbumItem.upsert({ where: { albumId_animeId: { albumId, animeId: animeId as string } }, create: { albumId, animeId: animeId as string }, update: {} });
  await prisma.profileAlbum.update({ where: { id: albumId }, data: { updatedAt: new Date() } });
  return { ok: true };
}

export async function removeAlbumItem(albumId: string, userId: string, animeId: string): Promise<{ ok: true } | AlbumError> {
  const denied = await ownAlbum(albumId, userId);
  if (denied) return denied;
  await prisma.profileAlbumItem.deleteMany({ where: { albumId, animeId } });
  return { ok: true };
}

const ITEM_ANIME = { select: { id: true, anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } } as const;
type ItemAnime = { id: string; anilistId: number | null; anidbId: number | null; kitsuId: number | null; titleRomaji: string; titleEnglish: string | null; titleNative: string | null; coverImage: string | null };
const toWork = (a: ItemAnime): AlbumWork => ({ animeId: a.id, key: a.anilistId !== null ? String(a.anilistId) : (catalogSlug(a) ?? a.id), href: workHref(a), titleRomaji: a.titleRomaji, titleEnglish: a.titleEnglish, titleNative: a.titleNative, coverImage: a.coverImage });
const fromEntry = (e: ProfileAnimeEntry): AlbumWork => ({ animeId: e.animeId ?? null, key: e.key, href: e.href, titleRomaji: e.titleRomaji, titleEnglish: e.titleEnglish, titleNative: e.titleNative, coverImage: e.coverImage });

/** Os álbuns do perfil (automáticos e personalizados) com a contagem e as primeiras capas; null se escondidos. */
export async function profileAlbums(targetId: string, viewerId: string | null): Promise<{ auto: AlbumCard[]; custom: AlbumCard[] } | null> {
  const list = await loadProfileAnimeList(targetId, viewerId);
  if (list.kind !== "ok") return null;
  const auto = AUTO_ALBUMS.map((a) => {
    const entries = list.list.entries.filter((e) => e.category === a.category);
    return { key: a.slug, name: a.name, count: entries.length, covers: entries.flatMap((e) => (e.coverImage ? [e.coverImage] : [])).slice(0, COVERS), auto: true };
  });
  const albums = await prisma.profileAlbum.findMany({
    where: { userId: targetId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { items: true } }, items: { orderBy: { addedAt: "desc" }, take: COVERS, include: { anime: { select: { coverImage: true } } } } },
  });
  const custom = albums.map((al) => ({ key: al.id, name: al.name, count: al._count.items, covers: al.items.flatMap((i) => (i.anime.coverImage ? [i.anime.coverImage] : [])), auto: false }));
  return { auto, custom };
}

export type AlbumView = { key: string; name: string; description: string | null; auto: boolean; isOwn: boolean; works: AlbumWork[] };

/** Um álbum (automático pelo slug ou personalizado pelo id) com as obras; null se não existe ou está escondido. */
export async function albumView(targetId: string, viewerId: string | null, key: string): Promise<AlbumView | null> {
  const list = await loadProfileAnimeList(targetId, viewerId);
  if (list.kind !== "ok") return null;
  const auto = AUTO_ALBUMS.find((a) => a.slug === key);
  if (auto) {
    return { key, name: auto.name, description: null, auto: true, isOwn: list.isOwn, works: list.list.entries.filter((e) => e.category === auto.category).map(fromEntry) };
  }
  const album = await prisma.profileAlbum.findFirst({ where: { id: key, userId: targetId }, include: { items: { orderBy: { addedAt: "desc" }, include: { anime: ITEM_ANIME } } } });
  if (!album) return null;
  // Uma obra com várias temporadas pode ter entrado por temporadas diferentes: aparece uma vez só.
  const seen = new Set<string>();
  const works = album.items.map((i) => toWork(i.anime)).filter((w) => (seen.has(w.key) ? false : (seen.add(w.key), true)));
  return { key, name: album.name, description: album.description, auto: false, isOwn: list.isOwn, works };
}

/** As obras da própria lista (uma por obra, como na aba Animes) para escolher o que entra no álbum. */
export async function albumCandidates(userId: string): Promise<AlbumWork[]> {
  const list = await loadProfileAnimeList(userId, userId);
  return list.kind === "ok" ? list.list.entries.map(fromEntry) : [];
}
