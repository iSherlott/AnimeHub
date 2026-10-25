import type { PrismaClient } from "@prisma/client";

/**
 * Episódios globais nos testes (Fase 4, ADR 0009): o episódio é a linha da agenda da obra, igual para todo mundo. Os
 * testes que antes criavam a cópia por usuário (`Episode`) criam aqui o episódio global e marcam a obra como já
 * consultada na Kitsu (a página não vai à fonte durante o teste).
 */
export type SeedEpisode = {
  number: number;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  synopsis?: string | null;
  thumbnail?: string | null;
  /** Só o dia (sem horário): vira `airDate`. */
  airDate?: Date | null;
  /** Dia e hora conhecidos: vira `airingAt`. */
  airingAt?: Date | null;
};

export async function seedGlobalEpisodes(prisma: PrismaClient, anilistId: number, work: { titleRomaji: string }, episodes: SeedEpisode[], options: { replace?: boolean } = {}): Promise<void> {
  if (options.replace !== false) await prisma.airingScheduleEntry.deleteMany({ where: { anilistId } });
  const catalog = await prisma.catalogEntry.findUnique({ where: { anilistId }, select: { id: true } });
  for (const ep of episodes) {
    const airDate = ep.airingAt ? null : ep.airDate ? new Date(Date.UTC(ep.airDate.getUTCFullYear(), ep.airDate.getUTCMonth(), ep.airDate.getUTCDate())) : null;
    const data = {
      anilistId,
      catalogEntryId: catalog?.id ?? null,
      episode: ep.number,
      airingAt: ep.airingAt ?? null,
      airDate,
      dateCertainty: ep.airingAt ? "EXACT" : airDate ? "DATE_ONLY" : "UNKNOWN",
      source: "kitsu",
      titleRomaji: work.titleRomaji,
      episodeTitle: ep.titleRomaji ?? null,
      episodeTitleEn: ep.titleEnglish ?? null,
      episodeTitleJa: ep.titleJapanese ?? null,
      synopsis: ep.synopsis ?? null,
      thumbnail: ep.thumbnail ?? null,
    };
    await prisma.airingScheduleEntry.upsert({ where: { anilistId_episode: { anilistId, episode: ep.number } }, create: data, update: data });
  }
  await prisma.episodeSourceCheck.upsert({ where: { anilistId }, create: { anilistId, found: episodes.length }, update: { checkedAt: new Date(), found: episodes.length } });
}

export async function clearGlobalEpisodes(prisma: PrismaClient, anilistIds: number[]): Promise<void> {
  await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: anilistIds } } });
  await prisma.episodeSourceCheck.deleteMany({ where: { anilistId: { in: anilistIds } } });
}
