import { prisma } from "@/lib/prisma";

/**
 * Avatar e banner do perfil escolhidos entre as imagens das obras que a pessoa ACOMPANHA
 * (capa e personagens para o avatar; banner e capa para o banner), agrupadas por obra — como a
 * "Seleção de Avatar" da Crunchyroll. Só uma URL que está nesta lista pode ser gravada: a
 * escolha nunca aceita um endereço arbitrário vindo do cliente.
 */
export type AvatarItem = { url: string; label: string };
export type AvatarGroup = {
  /** Chave do grupo: o AniList ID ou, para obra sem ele, o id do item da lista. */
  key: string;
  anilistId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  avatars: AvatarItem[];
  banners: AvatarItem[];
};

const MAX_CHARACTERS_PER_ANIME = 12;

function isHttps(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\//i.test(value);
}

/** Personagens guardados em `Anime.castJson` (lista da AniList): só nome e imagem https. */
export function charactersFromCast(castJson: string | null): AvatarItem[] {
  if (!castJson) return [];
  try {
    const parsed = JSON.parse(castJson) as Array<{ name?: unknown; image?: unknown }>;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const items: AvatarItem[] = [];
    for (const entry of parsed) {
      if (!isHttps(entry.image) || seen.has(entry.image)) continue;
      seen.add(entry.image);
      items.push({ url: entry.image, label: typeof entry.name === "string" ? entry.name : "Personagem" });
      if (items.length >= MAX_CHARACTERS_PER_ANIME) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function buildAvatarOptions(userId: string): Promise<AvatarGroup[]> {
  const animes = await prisma.anime.findMany({
    where: { userId },
    orderBy: { titleRomaji: "asc" },
    select: { id: true, anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true, bannerImage: true, castJson: true },
  });
  const groups: AvatarGroup[] = [];
  for (const a of animes) {
    const avatars: AvatarItem[] = [];
    if (isHttps(a.coverImage)) avatars.push({ url: a.coverImage, label: "Capa" });
    avatars.push(...charactersFromCast(a.castJson).filter((c) => c.url !== a.coverImage));
    const banners: AvatarItem[] = [];
    if (isHttps(a.bannerImage)) banners.push({ url: a.bannerImage, label: "Banner" });
    if (isHttps(a.coverImage)) banners.push({ url: a.coverImage, label: "Capa" });
    if (avatars.length === 0 && banners.length === 0) continue;
    groups.push({ key: a.anilistId !== null ? String(a.anilistId) : a.id, anilistId: a.anilistId, titleRomaji: a.titleRomaji, titleEnglish: a.titleEnglish, titleNative: a.titleNative, avatars, banners });
  }
  return groups;
}

export type ImageKind = "avatar" | "banner";

/** A URL escolhida precisa estar entre as opções da própria pessoa. */
export function isAllowedImage(groups: AvatarGroup[], kind: ImageKind, url: string): boolean {
  return groups.some((g) => (kind === "avatar" ? g.avatars : g.banners).some((i) => i.url === url));
}

/**
 * Avatar e capa são sempre imagens dos animes que a pessoa acompanha: se ela deixou de acompanhar o anime da imagem, a
 * imagem volta ao padrão (iniciais no avatar, sem capa). Chamado ao tirar um anime da lista e ao abrir o Editar perfil.
 */
export async function dropStaleProfileImages(userId: string): Promise<{ avatarUrl: string | null; bannerUrl: string | null }> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true, bannerUrl: true } });
  if (!me || (!me.avatarUrl && !me.bannerUrl)) return { avatarUrl: me?.avatarUrl ?? null, bannerUrl: me?.bannerUrl ?? null };
  const groups = await buildAvatarOptions(userId);
  const avatarUrl = me.avatarUrl && isAllowedImage(groups, "avatar", me.avatarUrl) ? me.avatarUrl : null;
  const bannerUrl = me.bannerUrl && isAllowedImage(groups, "banner", me.bannerUrl) ? me.bannerUrl : null;
  if (avatarUrl !== me.avatarUrl || bannerUrl !== me.bannerUrl) await prisma.user.update({ where: { id: userId }, data: { avatarUrl, bannerUrl } });
  return { avatarUrl, bannerUrl };
}
