import { prisma } from "@/lib/prisma";

/**
 * Aberturas e encerramentos (10/11/2026), da API pública do AnimeThemes (https://api.animethemes.moe), quando o admin
 * carrega uma temporada. Guardamos só o que identifica a música (tipo, número, título, artistas, episódios) e os links
 * para o vídeo deles — nada de vídeo copiado para cá.
 */
const API = process.env.ANIMETHEMES_API_URL ?? "https://api.animethemes.moe";
const SITE = "https://animethemes.moe";
const USER_AGENT = "AnimeHubThemesBot/1.0 (+aberturas das obras da temporada)";
/** A API aceita várias obras numa consulta; menos idas e voltas respeitam o limite deles. */
const BATCH = 20;
const GAP_MS = Number(process.env.ANIMETHEMES_REQUEST_GAP_MS ?? 1500);

export type ParsedTheme = { anilistId: number; type: "OP" | "ED"; sequence: number; slug: string; title: string | null; artists: string | null; episodes: string | null; videoUrl: string | null; sourceUrl: string };

type RawAnime = {
  slug?: string;
  resources?: { site?: string; external_id?: number }[];
  animethemes?: {
    type?: string;
    sequence?: number | null;
    slug?: string;
    song?: { title?: string | null; artists?: { name?: string }[] } | null;
    animethemeentries?: { episodes?: string | null; videos?: { link?: string }[] }[];
  }[];
};

/** A resposta da API → as aberturas e encerramentos de cada obra da AniList. */
export function parseThemes(json: unknown): ParsedTheme[] {
  const list = (json as { anime?: RawAnime[] })?.anime;
  if (!Array.isArray(list)) return [];
  const out: ParsedTheme[] = [];
  for (const anime of list) {
    const anilistId = anime.resources?.find((r) => r.site === "AniList")?.external_id;
    if (!anilistId || !anime.slug) continue;
    for (const theme of anime.animethemes ?? []) {
      if (theme.type !== "OP" && theme.type !== "ED") continue;
      const entry = theme.animethemeentries?.[0];
      const slug = theme.slug ?? `${theme.type}${theme.sequence ?? 1}`;
      out.push({
        anilistId,
        type: theme.type,
        sequence: theme.sequence ?? 1,
        slug,
        title: theme.song?.title?.trim() || null,
        artists: theme.song?.artists?.map((a) => a.name).filter(Boolean).join(", ") || null,
        episodes: entry?.episodes?.trim() || null,
        videoUrl: entry?.videos?.[0]?.link ?? null,
        sourceUrl: `${SITE}/anime/${anime.slug}/${slug}`,
      });
    }
  }
  return out;
}

export function themesUrl(anilistIds: number[]): string {
  const params = new URLSearchParams({
    "filter[has]": "resources",
    "filter[site]": "AniList",
    "filter[external_id]": anilistIds.join(","),
    include: "resources,animethemes.animethemeentries.videos,animethemes.song.artists",
    "page[size]": String(anilistIds.length),
  });
  return `${API}/anime?${params.toString()}`;
}

/** Carrega as aberturas das obras pedidas (em lotes). Devolve quantas obras ganharam pelo menos uma música. */
export async function loadThemes(anilistIds: number[], fetcher: typeof fetch = fetch): Promise<{ works: number; themes: number; failed: number }> {
  let works = 0;
  let themes = 0;
  let failed = 0;
  for (let start = 0; start < anilistIds.length; start += BATCH) {
    const batch = anilistIds.slice(start, start + BATCH);
    try {
      const res = await fetcher(themesUrl(batch), { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`AnimeThemes ${res.status}`);
      const parsed = parseThemes(await res.json());
      const byWork = new Set(parsed.map((p) => p.anilistId));
      works += byWork.size;
      for (const theme of parsed) {
        const { anilistId, slug, ...data } = theme;
        await prisma.workTheme.upsert({ where: { anilistId_slug: { anilistId, slug } }, create: { anilistId, slug, ...data }, update: { ...data, fetchedAt: new Date() } });
        themes += 1;
      }
    } catch (error) {
      failed += batch.length;
      console.error("[animeThemes] lote falhou:", error);
    }
    if (start + BATCH < anilistIds.length && GAP_MS > 0) await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return { works, themes, failed };
}

import type { ThemeView } from "@/lib/animeThemesTypes";
export type { ThemeView };

export async function themesFor(anilistId: number, viewerId: string | null): Promise<ThemeView[]> {
  const rows = await prisma.workTheme.findMany({ where: { anilistId }, orderBy: [{ type: "desc" }, { sequence: "asc" }], include: { _count: { select: { likes: true } }, likes: viewerId ? { where: { userId: viewerId }, select: { userId: true } } : false } });
  return rows.map((r) => ({ id: r.id, type: r.type, sequence: r.sequence, slug: r.slug, title: r.title, artists: r.artists, episodes: r.episodes, sourceUrl: r.sourceUrl, videoUrl: r.videoUrl, likes: r._count.likes, likedByMe: Array.isArray(r.likes) && r.likes.length > 0 }));
}

export async function toggleThemeLike(themeId: string, userId: string, liked: boolean): Promise<{ ok: true; likes: number } | { ok: false; status: 404; error: string }> {
  if (!(await prisma.workTheme.findUnique({ where: { id: themeId }, select: { id: true } }))) return { ok: false, status: 404, error: "Música não encontrada." };
  if (liked) await prisma.workThemeLike.upsert({ where: { themeId_userId: { themeId, userId } }, create: { themeId, userId }, update: {} });
  else await prisma.workThemeLike.deleteMany({ where: { themeId, userId } });
  return { ok: true, likes: await prisma.workThemeLike.count({ where: { themeId } }) };
}

/** Ranking da temporada: as músicas das obras da temporada, das mais curtidas para as menos. */
export async function seasonThemeRanking(season: string, seasonYear: number, viewerId: string | null, type: "OP" | "ED" = "OP") {
  const works = await prisma.catalogEntry.findMany({ where: { onPlatform: true, season, seasonYear, anilistId: { not: null } }, select: { anilistId: true, titleRomaji: true, coverImage: true } });
  const byId = new Map(works.map((w) => [w.anilistId as number, w]));
  const rows = await prisma.workTheme.findMany({
    where: { anilistId: { in: [...byId.keys()] }, type },
    include: { _count: { select: { likes: true } }, likes: viewerId ? { where: { userId: viewerId }, select: { userId: true } } : false },
  });
  return rows
    .map((r) => ({ id: r.id, type: r.type, sequence: r.sequence, slug: r.slug, title: r.title, artists: r.artists, episodes: r.episodes, sourceUrl: r.sourceUrl, videoUrl: r.videoUrl, likes: r._count.likes, likedByMe: Array.isArray(r.likes) && r.likes.length > 0, work: byId.get(r.anilistId) ?? null }))
    .sort((a, b) => b.likes - a.likes || (a.work?.titleRomaji ?? "").localeCompare(b.work?.titleRomaji ?? "", "pt-BR") || a.sequence - b.sequence);
}
