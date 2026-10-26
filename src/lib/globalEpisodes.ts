import type { Episode, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { catalogEntryIdFor } from "@/lib/catalogLink";
import { certaintyFor, releaseState, type ReleaseState } from "@/lib/episodeState";

/**
 * Episódio global (Fase 4, ADR 0009): a linha da agenda (`AiringScheduleEntry`) é o episódio da obra, igual para todo
 * mundo. A AniList traz o dia e a hora; Kitsu e AniDB completam título, sinopse e imagem (e o dia, quando a agenda não
 * tem). Nada é por usuário: o que alguém vê na página da obra é o mesmo que o admin edita.
 */
export const GLOBAL_EPISODE_SELECT = {
  id: true,
  anilistId: true,
  episode: true,
  airingAt: true,
  airDate: true,
  dateCertainty: true,
  status: true,
  source: true,
  manualFields: true,
  episodeTitle: true,
  episodeTitleEn: true,
  episodeTitleJa: true,
  synopsis: true,
  thumbnail: true,
} satisfies Prisma.AiringScheduleEntrySelect;

export type GlobalEpisodeRow = Prisma.AiringScheduleEntryGetPayload<{ select: typeof GLOBAL_EPISODE_SELECT }>;

export function loadGlobalEpisodes(anilistId: number): Promise<GlobalEpisodeRow[]> {
  return prisma.airingScheduleEntry.findMany({ where: { anilistId }, orderBy: { episode: "asc" }, select: GLOBAL_EPISODE_SELECT });
}

/** Episódios de uma obra pelo catálogo (obras sem AniList ID: só do AniDB ou da Kitsu). */
export function loadCatalogEpisodes(catalogEntryId: string): Promise<GlobalEpisodeRow[]> {
  return prisma.airingScheduleEntry.findMany({ where: { catalogEntryId }, orderBy: { episode: "asc" }, select: GLOBAL_EPISODE_SELECT });
}

/** Já tem conteúdo de episódio (não só data de agenda)? */
export function hasEpisodeContent(rows: ReadonlyArray<GlobalEpisodeRow>): boolean {
  return rows.some((r) => r.episodeTitle || r.episodeTitleEn || r.episodeTitleJa || r.synopsis || r.thumbnail);
}

/** No formato que a grade de episódios da página da obra já usa (a temporada interna da Kitsu não existe mais: 1). */
export function asEpisodes(rows: ReadonlyArray<GlobalEpisodeRow>): Episode[] {
  return rows.map(
    (r) =>
      ({
        id: r.id,
        animeId: "",
        number: r.episode,
        seasonNumber: 1,
        titleRomaji: r.episodeTitle,
        titleEnglish: r.episodeTitleEn,
        titleJapanese: r.episodeTitleJa,
        synopsis: r.synopsis,
        thumbnail: r.thumbnail,
        airDate: r.airingAt ?? r.airDate,
        createdAt: new Date(0),
      }) satisfies Episode
  );
}

/** Para a linha do tempo pública (quem ainda não acompanha a obra). */
export function asScheduledEpisodes(rows: ReadonlyArray<GlobalEpisodeRow>, images: ReadonlyMap<number, string>, now: Date = new Date()) {
  return rows.map((r) => ({
    episode: r.episode,
    airingAt: r.airingAt ? r.airingAt.toISOString() : null,
    airDate: r.airDate ? r.airDate.toISOString().slice(0, 10) : null,
    state: releaseState(r, now) as ReleaseState,
    title: r.episodeTitle || r.episodeTitleEn || r.episodeTitleJa ? { romaji: r.episodeTitle, english: r.episodeTitleEn, native: r.episodeTitleJa } : null,
    synopsis: r.synopsis,
    image: r.thumbnail ?? images.get(r.episode) ?? null,
  }));
}

export type SourceEpisode = { number: number; titleRomaji: string | null; titleEnglish: string | null; titleJapanese: string | null; synopsis?: string | null; thumbnail?: string | null; airDate: Date | null };

const FIELD_MAP = [
  ["episodeTitle", "titleRomaji"],
  ["episodeTitleEn", "titleEnglish"],
  ["episodeTitleJa", "titleJapanese"],
  ["synopsis", "synopsis"],
  ["thumbnail", "thumbnail"],
] as const;

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const dayOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Números repetidos na mesma resposta (temporadas internas que reiniciam a contagem) são ambíguos: ficam de fora. */
export function unambiguous<T extends { number: number }>(episodes: ReadonlyArray<T>): T[] {
  const count = new Map<number, number>();
  for (const e of episodes) count.set(e.number, (count.get(e.number) ?? 0) + 1);
  return episodes.filter((e) => e.number > 0 && count.get(e.number) === 1);
}

/**
 * Grava o que uma fonte de episódios (Kitsu, AniDB) trouxe no episódio global. `fill` só preenche o que está vazio;
 * `refresh` (o "Atualizar dados" pedido por alguém) também troca o que mudou. Campo protegido pelo admin nunca muda;
 * o dia só entra quando a agenda não tem o instante (a AniList, com hora, vale mais).
 */
export async function upsertSourceEpisodes(
  anilistId: number | null,
  work: { titleRomaji: string; titleEnglish: string | null; titleNative: string | null; catalogEntryId?: string | null },
  incoming: ReadonlyArray<SourceEpisode>,
  source: "kitsu" | "anidb",
  mode: "fill" | "refresh"
): Promise<number> {
  const episodes = unambiguous(incoming);
  if (episodes.length === 0) return 0;
  // Obra sem AniList ID (só do AniDB): a identidade do episódio é (obra do catálogo, número).
  const catalogEntryId = work.catalogEntryId ?? (anilistId !== null ? await catalogEntryIdFor(anilistId) : null);
  if (anilistId === null && !catalogEntryId) return 0;
  const byWork = { OR: [...(anilistId !== null ? [{ anilistId }] : []), ...(catalogEntryId ? [{ catalogEntryId }] : [])] };
  const existing = new Map((await prisma.airingScheduleEntry.findMany({ where: byWork, select: GLOBAL_EPISODE_SELECT })).map((r) => [r.episode, r]));
  let written = 0;
  for (const ep of episodes) {
    const airDate = ep.airDate ? dayOnly(ep.airDate) : null;
    const row = existing.get(ep.number);
    if (!row) {
      await prisma.airingScheduleEntry.create({
        data: {
          anilistId,
          ...(catalogEntryId ? { catalogEntryId } : {}),
          episode: ep.number,
          airingAt: null,
          airDate,
          dateCertainty: certaintyFor(null, airDate),
          source,
          titleRomaji: work.titleRomaji,
          titleEnglish: work.titleEnglish,
          titleNative: work.titleNative,
          episodeTitle: ep.titleRomaji,
          episodeTitleEn: ep.titleEnglish,
          episodeTitleJa: ep.titleJapanese,
          synopsis: ep.synopsis ?? null,
          thumbnail: ep.thumbnail ?? null,
        },
      });
      written += 1;
      continue;
    }
    const manual = new Set(row.manualFields);
    const data: Prisma.AiringScheduleEntryUpdateInput = {};
    for (const [field, key] of FIELD_MAP) {
      const value = ep[key];
      if (manual.has(field) || blank(value)) continue;
      if (row[field] === value || (mode === "fill" && !blank(row[field]))) continue;
      (data as Record<string, unknown>)[field] = value;
    }
    const dateLocked = manual.has("airingAt") || manual.has("airDate");
    if (!dateLocked && !row.airingAt && airDate && (mode === "refresh" || !row.airDate) && row.airDate?.getTime() !== airDate.getTime()) {
      data.airDate = airDate;
      data.dateCertainty = certaintyFor(null, airDate);
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.airingScheduleEntry.update({ where: { id: row.id }, data });
    written += 1;
  }
  return written;
}

/** Registra a consulta (mesmo sem nada encontrado), para não perguntar à fonte a cada visita. */
export async function markEpisodesChecked(anilistId: number, kitsuId: number | null, found: number): Promise<void> {
  await prisma.episodeSourceCheck.upsert({ where: { anilistId }, create: { anilistId, kitsuId, found }, update: { kitsuId, found, checkedAt: new Date() } });
}

/** Consultou a fonte há menos de uma semana? */
export async function recentlyChecked(anilistId: number, now: Date = new Date()): Promise<boolean> {
  const check = await prisma.episodeSourceCheck.findUnique({ where: { anilistId } });
  return check !== null && now.getTime() - check.checkedAt.getTime() < 7 * 24 * 3600_000;
}
