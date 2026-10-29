import { prisma } from "@/lib/prisma";
import { groupAnimes } from "@/lib/animeGroups";
import { normalizeSearch } from "@/lib/profileAnimeList";
import { fitsBackground, fitsBanner, imageSizes } from "@/lib/imageSize";

/**
 * Avatar, banner e plano de fundo do perfil escolhidos entre as imagens das obras que a pessoa ACOMPANHA
 * (capa e personagens para o avatar; as imagens largas da obra para o banner e o plano de fundo), agrupadas por obra —
 * como a "Seleção de Avatar" da Crunchyroll. Banner e plano de fundo só oferecem imagens em Full HD (src/lib/imageSize.ts):
 * faixa larga de 1900 px ou mais para o banner, tela cheia de 1900×1000 ou mais para o fundo. A capa (460 px) ficou só
 * no avatar: esticada, deixava o perfil borrado. Só uma URL que está nesta lista pode ser gravada: a escolha nunca aceita um
 * endereço arbitrário vindo do cliente.
 *
 * Uma obra com várias temporadas é UM grupo. Antes era um grupo por temporada, e as mesmas pessoas apareciam de novo em
 * cada uma (na lista real: 800 linhas para 429 obras; dos 4.826 personagens, 646 eram a mesma imagem e 536 nomes se
 * repetiam). Agora as imagens de todas as temporadas se juntam, sem repetir endereço nem personagem (fica a imagem da
 * temporada mais recente), e um endereço já mostrado numa obra não volta em outra.
 */
export type AvatarItem = { url: string; label: string };
export type AvatarGroup = {
  /** Chave do grupo: o AniList ID da primeira temporada ou, para obra sem ele, o id do item da lista. */
  key: string;
  anilistId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  avatars: AvatarItem[];
  /** Imagens largas em Full HD no formato do banner. */
  banners: AvatarItem[];
  /** Imagens em Full HD de tela cheia, para o plano de fundo. */
  backgrounds: AvatarItem[];
};

const MAX_CHARACTERS_PER_SEASON = 12;
const MAX_CHARACTERS_PER_WORK = 24;
/** Obras por página no seletor. */
export const IMAGE_PAGE_SIZE = 8;

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
      if (items.length >= MAX_CHARACTERS_PER_SEASON) break;
    }
    return items;
  } catch {
    return [];
  }
}

type SeasonImages = { seasonNumber: number; coverImage: string | null; bannerImage: string | null; castJson: string | null };

const seasonLabel = (base: string, seasonNumber: number, many: boolean) => (many && seasonNumber > 1 ? `${base} · ${seasonNumber}ª temporada` : base);

/**
 * As imagens de uma obra, juntando as temporadas (da primeira à última). `taken` são os endereços já usados por outras
 * obras: não se repetem. `wide` são os banners da obra, ainda sem medir (o tamanho decide se servem de banner ou de fundo).
 */
export function workImages(seasons: SeasonImages[], taken: Set<string>): { avatars: AvatarItem[]; wide: AvatarItem[] } {
  const many = seasons.length > 1;
  const avatarUrls = new Set<string>();
  const bannerUrls = new Set<string>();
  const avatars: AvatarItem[] = [];
  const wide: AvatarItem[] = [];
  const pushAvatar = (item: AvatarItem) => {
    if (avatarUrls.has(item.url) || taken.has(item.url)) return;
    avatarUrls.add(item.url);
    avatars.push(item);
  };
  const pushBanner = (item: AvatarItem) => {
    if (bannerUrls.has(item.url) || taken.has(item.url)) return;
    bannerUrls.add(item.url);
    wide.push(item);
  };
  for (const s of seasons) if (isHttps(s.coverImage)) pushAvatar({ url: s.coverImage, label: seasonLabel("Capa", s.seasonNumber, many) });
  // Personagens: da temporada mais recente para a primeira, um por nome (a arte mais nova fica).
  const names = new Set<string>();
  let characters = 0;
  for (const s of [...seasons].reverse()) {
    for (const c of charactersFromCast(s.castJson)) {
      if (characters >= MAX_CHARACTERS_PER_WORK) break;
      const name = normalizeSearch(c.label);
      if (names.has(name)) continue;
      names.add(name);
      const before = avatars.length;
      pushAvatar(c);
      if (avatars.length > before) characters += 1;
    }
  }
  for (const s of seasons) if (isHttps(s.bannerImage)) pushBanner({ url: s.bannerImage, label: seasonLabel("Banner", s.seasonNumber, many) });
  for (const url of [...avatarUrls, ...bannerUrls]) taken.add(url);
  return { avatars, wide };
}

/**
 * As opções de cada obra. Com `measure`, mede na hora as imagens largas que ainda não têm tamanho (o seletor de banner e
 * de fundo); sem ele, usa só as já medidas (o avatar não depende disso, e a escolha só aceita o que o seletor mostrou).
 */
export async function buildAvatarOptions(userId: string, { measure = false } = {}): Promise<AvatarGroup[]> {
  const animes = await prisma.anime.findMany({
    where: { userId },
    orderBy: { titleRomaji: "asc" },
    select: { id: true, anilistId: true, seriesKey: true, seasonNumber: true, titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true, bannerImage: true, castJson: true },
  });
  const works = (await groupAnimes(animes)).map(({ members }) => members);
  const title = (members: (typeof animes)[number][]) => members[0].titleRomaji;
  works.sort((a, b) => title(a).localeCompare(title(b), "pt-BR"));
  const taken = new Set<string>();
  const images = works.map((members) => ({ members, ...workImages(members, taken) }));
  const sizes = await imageSizes(
    images.flatMap((i) => i.wide.map((w) => w.url)),
    { measureMissing: measure },
  );
  const groups: AvatarGroup[] = [];
  for (const { members, avatars, wide } of images) {
    const first = members[0];
    const banners = wide.filter((w) => fitsBanner(sizes.get(w.url)));
    const backgrounds = wide.filter((w) => fitsBackground(sizes.get(w.url)));
    if (avatars.length === 0 && banners.length === 0 && backgrounds.length === 0) continue;
    groups.push({ key: first.anilistId !== null ? String(first.anilistId) : first.id, anilistId: first.anilistId, titleRomaji: first.titleRomaji, titleEnglish: first.titleEnglish, titleNative: first.titleNative, avatars, banners, backgrounds });
  }
  return groups;
}

export type ImageKind = "avatar" | "banner" | "background";

export function isImageKind(value: unknown): value is ImageKind {
  return value === "avatar" || value === "banner" || value === "background";
}

/** As imagens de um tipo. */
export function itemsOf(group: AvatarGroup, kind: ImageKind): AvatarItem[] {
  return kind === "avatar" ? group.avatars : kind === "banner" ? group.banners : group.backgrounds;
}

/** A URL escolhida precisa estar entre as opções da própria pessoa. */
export function isAllowedImage(groups: AvatarGroup[], kind: ImageKind, url: string): boolean {
  return groups.some((g) => itemsOf(g, kind).some((i) => i.url === url));
}

/** Uma página do seletor: só as obras com imagem desse tipo, filtradas pelo título (qualquer um, sem acento). */
export function pageOfOptions(groups: AvatarGroup[], kind: ImageKind, q: string, page: number, pageSize = IMAGE_PAGE_SIZE) {
  const needle = normalizeSearch(q);
  const matching = groups.filter((g) => itemsOf(g, kind).length > 0 && (!needle || normalizeSearch([g.titleRomaji, g.titleEnglish, g.titleNative].filter(Boolean).join(" ")).includes(needle)));
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { groups: matching.slice(current * pageSize, (current + 1) * pageSize), total: matching.length, page: current, pages };
}

/**
 * Avatar, capa e plano de fundo são sempre imagens dos animes que a pessoa acompanha: se ela deixou de acompanhar o
 * anime da imagem, a imagem volta ao padrão (foto padrão no avatar, sem capa, sem fundo). Chamado ao tirar um anime da
 * lista e ao abrir o Editar perfil. Banner e fundo escolhidos antes da regra do Full HD continuam enquanto a obra estiver
 * na lista: aqui só vale de qual obra a imagem é, não o tamanho.
 */
export async function dropStaleProfileImages(userId: string): Promise<{ avatarUrl: string | null; bannerUrl: string | null; backgroundUrl: string | null }> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true, bannerUrl: true, backgroundUrl: true } });
  if (!me || (!me.avatarUrl && !me.bannerUrl && !me.backgroundUrl)) return { avatarUrl: me?.avatarUrl ?? null, bannerUrl: me?.bannerUrl ?? null, backgroundUrl: me?.backgroundUrl ?? null };
  const [groups, rows] = await Promise.all([buildAvatarOptions(userId), prisma.anime.findMany({ where: { userId }, select: { coverImage: true, bannerImage: true } })]);
  const owned = new Set(rows.flatMap((r) => [r.coverImage, r.bannerImage]).filter((u): u is string => !!u));
  const next = {
    avatarUrl: me.avatarUrl && isAllowedImage(groups, "avatar", me.avatarUrl) ? me.avatarUrl : null,
    bannerUrl: me.bannerUrl && owned.has(me.bannerUrl) ? me.bannerUrl : null,
    backgroundUrl: me.backgroundUrl && owned.has(me.backgroundUrl) ? me.backgroundUrl : null,
  };
  if (next.avatarUrl !== me.avatarUrl || next.bannerUrl !== me.bannerUrl || next.backgroundUrl !== me.backgroundUrl) await prisma.user.update({ where: { id: userId }, data: next });
  return next;
}
