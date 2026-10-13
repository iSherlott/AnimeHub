import { prisma } from "@/lib/prisma";

/**
 * "Adiar" / Para assistir: o episódio do dia que a pessoa não viu vira uma pendência, numa lista própria.
 * A pendência guarda só o PRIMEIRO episódio que ficou sem ver ("parei no EP02"); enquanto a obra segue
 * saindo, a lista mostra até onde já saiu ("já saiu até o EP03 · esta semana"). Não existe tracking de
 * consumo: é um lembrete pessoal, nunca um registro de episódios assistidos.
 */
export const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Adiar de novo: vale o episódio MAIS ANTIGO sem ver (adiar o EP03 depois do EP02 continua "parei no EP02"). */
export function mergeFromEpisode(existing: number | null, episode: number): number {
  return existing === null ? episode : Math.min(existing, episode);
}

export type Airing = { episode: number; airingAt: Date };

export type PendingSummary = {
  /** Último episódio que já foi ao ar. */
  latestAired: number | null;
  /** Esse episódio saiu nos últimos 7 dias ("está no EP03 essa semana"). */
  latestAiredThisWeek: boolean;
  /** Episódios que já saíram desde onde parou (inclui o próprio EP onde parou). */
  behind: number;
  /** Próximo lançamento, se houver. */
  next: { episode: number; at: Date } | null;
};

export function summarizePending(fromEpisode: number, airings: Airing[], now: Date = new Date()): PendingSummary {
  const aired = airings.filter((a) => a.airingAt.getTime() <= now.getTime()).sort((a, b) => b.episode - a.episode);
  const upcoming = airings.filter((a) => a.airingAt.getTime() > now.getTime()).sort((a, b) => a.airingAt.getTime() - b.airingAt.getTime());
  const latest = aired[0] ?? null;
  return {
    latestAired: latest?.episode ?? null,
    latestAiredThisWeek: latest !== null && now.getTime() - latest.airingAt.getTime() <= WEEK_MS,
    behind: latest ? Math.max(0, latest.episode - fromEpisode + 1) : 0,
    next: upcoming[0] ? { episode: upcoming[0].episode, at: upcoming[0].airingAt } : null,
  };
}

export class PendingError extends Error {
  constructor(
    readonly code: "NOT_FOLLOWING" | "BAD_EPISODE",
    message: string
  ) {
    super(message);
  }
}

/** Adia o episódio: só de obra que a pessoa acompanha. Devolve o episódio em que ela "parou". */
export async function postpone(userId: string, anilistId: number, episode: number): Promise<number> {
  if (!Number.isInteger(episode) || episode < 1 || episode > 5000) throw new PendingError("BAD_EPISODE", "Episódio inválido.");
  const following = await prisma.anime.findUnique({ where: { userId_anilistId: { userId, anilistId } }, select: { id: true, watchState: true } });
  if (!following) throw new PendingError("NOT_FOLLOWING", "Acompanhe a obra para adiar episódios.");
  // Adiar um episódio desfaz um "Terminei" marcado antes: a obra voltou a ter algo por ver.
  if (following.watchState === "FINISHED") await prisma.anime.update({ where: { id: following.id }, data: { watchState: null } });
  const existing = await prisma.pendingEpisode.findUnique({ where: { userId_anilistId: { userId, anilistId } } });
  const fromEpisode = mergeFromEpisode(existing?.fromEpisode ?? null, episode);
  await prisma.pendingEpisode.upsert({ where: { userId_anilistId: { userId, anilistId } }, create: { userId, anilistId, fromEpisode }, update: { fromEpisode } });
  return fromEpisode;
}

/** "Já assisti" / retomar: remove a pendência da obra. */
export async function resolvePending(userId: string, anilistId: number): Promise<boolean> {
  const { count } = await prisma.pendingEpisode.deleteMany({ where: { userId, anilistId } });
  return count > 0;
}

/** anilistId → episódio em que parou, para marcar o calendário. */
export async function pendingFromMap(userId: string, anilistIds: number[]): Promise<Map<number, number>> {
  if (anilistIds.length === 0) return new Map();
  const rows = await prisma.pendingEpisode.findMany({ where: { userId, anilistId: { in: anilistIds } }, select: { anilistId: true, fromEpisode: true } });
  return new Map(rows.map((r) => [r.anilistId, r.fromEpisode]));
}

export type PendingEntryDTO = {
  anilistId: number;
  animeId: string;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  titlePortuguese: string | null;
  coverImage: string | null;
  genres: string[];
  status: string | null;
  fromEpisode: number;
  postponedAt: string;
  latestAired: number | null;
  latestAiredThisWeek: boolean;
  behind: number;
  next: { episode: number; at: string } | null;
  /** Ainda sai episódio novo (próximo agendado, ou em exibição). */
  stillAiring: boolean;
  /** Onde a pessoa assiste (links que ela cadastrou na obra). */
  watchLinks: Array<{ platform: string; url: string }>;
};

/** A lista "Para assistir" da pessoa: mais atrasadas primeiro. Pendência de obra que saiu da lista é descartada. */
export async function listPending(userId: string, now: Date = new Date()): Promise<PendingEntryDTO[]> {
  const rows = await prisma.pendingEpisode.findMany({ where: { userId }, orderBy: { postponedAt: "asc" } });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.anilistId);
  const [animes, airings] = await Promise.all([
    prisma.anime.findMany({ where: { userId, anilistId: { in: ids } }, include: { platformLinks: true } }),
    prisma.airingScheduleEntry.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, episode: true, airingAt: true } }),
  ]);
  const animeById = new Map(animes.map((a) => [a.anilistId, a]));
  const airingsById = new Map<number, Airing[]>();
  for (const a of airings) airingsById.set(a.anilistId, [...(airingsById.get(a.anilistId) ?? []), { episode: a.episode, airingAt: a.airingAt }]);

  const orphans = rows.filter((r) => !animeById.has(r.anilistId));
  if (orphans.length > 0) await prisma.pendingEpisode.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });

  const entries = rows
    .filter((r) => animeById.has(r.anilistId))
    .map((r) => {
      const anime = animeById.get(r.anilistId)!;
      const summary = summarizePending(r.fromEpisode, airingsById.get(r.anilistId) ?? [], now);
      return {
        anilistId: r.anilistId,
        animeId: anime.id,
        titleRomaji: anime.titleRomaji,
        titleEnglish: anime.titleEnglish,
        titleNative: anime.titleNative,
        titlePortuguese: anime.titlePortuguese,
        coverImage: anime.coverImage,
        genres: anime.genres ? anime.genres.split(",").filter(Boolean) : [],
        status: anime.status,
        fromEpisode: r.fromEpisode,
        postponedAt: r.postponedAt.toISOString(),
        latestAired: summary.latestAired,
        latestAiredThisWeek: summary.latestAiredThisWeek,
        behind: summary.behind,
        next: summary.next ? { episode: summary.next.episode, at: summary.next.at.toISOString() } : null,
        stillAiring: summary.next !== null || anime.status === "RELEASING",
        watchLinks: anime.platformLinks.map((l) => ({ platform: l.platform, url: l.url })),
      } satisfies PendingEntryDTO;
    });
  return entries.sort((a, b) => b.behind - a.behind || a.postponedAt.localeCompare(b.postponedAt));
}
