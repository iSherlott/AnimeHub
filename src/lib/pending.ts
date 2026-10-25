import { prisma } from "@/lib/prisma";
import { hasAired, timed, withAnilist } from "@/lib/episodeState";

/**
 * "Adiar" / Para assistir (D5, Fase 4): a pessoa adia a OBRA — um lembrete pessoal de que quer voltar a ela, sem número
 * de episódio. Nada de "parei no EP02" nem "N episódios para ver": o sistema não registra o que alguém assistiu. A lista
 * mostra só fatos globais da obra (até onde já saiu, o próximo lançamento) e quando ela foi adiada.
 */
export const WEEK_MS = 7 * 24 * 3600 * 1000;

export type Airing = { episode: number; airingAt: Date | null; airDate?: Date | null; status?: string };

export type PendingSummary = {
  /** Último episódio que já foi ao ar (global). */
  latestAired: number | null;
  /** Esse episódio saiu nos últimos 7 dias ("está no EP03 essa semana"). */
  latestAiredThisWeek: boolean;
  /** Próximo lançamento com dia e hora, se houver. */
  next: { episode: number; at: Date } | null;
};

export function summarizePending(airings: Airing[], now: Date = new Date()): PendingSummary {
  const dated = airings.map((a) => ({ ...a, airDate: a.airDate ?? null, status: a.status ?? "ACTIVE" }));
  const aired = dated.filter((a) => hasAired(a, now)).sort((a, b) => b.episode - a.episode);
  const upcoming = timed(dated.filter((a) => a.status === "ACTIVE" && a.airingAt !== null && a.airingAt.getTime() > now.getTime())).sort((a, b) => a.airingAt.getTime() - b.airingAt.getTime());
  const latest = aired[0] ?? null;
  const latestAt = latest ? (latest.airingAt ?? latest.airDate) : null;
  return {
    latestAired: latest?.episode ?? null,
    latestAiredThisWeek: latestAt !== null && now.getTime() - latestAt.getTime() <= WEEK_MS,
    next: upcoming[0] ? { episode: upcoming[0].episode, at: upcoming[0].airingAt } : null,
  };
}

export class PendingError extends Error {
  constructor(
    readonly code: "NOT_FOLLOWING",
    message: string
  ) {
    super(message);
  }
}

/** Adia a obra: só de obra que a pessoa acompanha. Adiar de novo mantém a data do primeiro adiamento. */
export async function postpone(userId: string, anilistId: number): Promise<{ postponedAt: Date }> {
  const following = await prisma.anime.findUnique({ where: { userId_anilistId: { userId, anilistId } }, select: { id: true, watchState: true } });
  if (!following) throw new PendingError("NOT_FOLLOWING", "Acompanhe a obra para adiá-la.");
  // Adiar desfaz um "Terminei" marcado antes: a obra voltou a ter algo por ver.
  if (following.watchState === "FINISHED") await prisma.anime.update({ where: { id: following.id }, data: { watchState: null } });
  const row = await prisma.pendingEpisode.upsert({ where: { userId_anilistId: { userId, anilistId } }, create: { userId, anilistId, fromEpisode: null }, update: {} });
  return { postponedAt: row.postponedAt };
}

/** "Já assisti" / retomar: remove a pendência da obra. */
export async function resolvePending(userId: string, anilistId: number): Promise<boolean> {
  const { count } = await prisma.pendingEpisode.deleteMany({ where: { userId, anilistId } });
  return count > 0;
}

/** Obras adiadas pela pessoa entre as dadas (para marcar o calendário). */
export async function postponedSet(userId: string, anilistIds: number[]): Promise<Set<number>> {
  if (anilistIds.length === 0) return new Set();
  const rows = await prisma.pendingEpisode.findMany({ where: { userId, anilistId: { in: anilistIds } }, select: { anilistId: true } });
  return new Set(rows.map((r) => r.anilistId));
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
  postponedAt: string;
  latestAired: number | null;
  latestAiredThisWeek: boolean;
  next: { episode: number; at: string } | null;
  /** Ainda sai episódio novo (próximo agendado, ou em exibição). */
  stillAiring: boolean;
  /** Onde a pessoa assiste (links que ela cadastrou na obra). */
  watchLinks: Array<{ platform: string; url: string }>;
};

/** A lista "Para assistir" da pessoa: adiadas há mais tempo primeiro. Pendência de obra que saiu da lista é descartada. */
export async function listPending(userId: string, now: Date = new Date()): Promise<PendingEntryDTO[]> {
  const rows = await prisma.pendingEpisode.findMany({ where: { userId }, orderBy: { postponedAt: "asc" } });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.anilistId);
  const [animes, airings] = await Promise.all([
    prisma.anime.findMany({ where: { userId, anilistId: { in: ids } }, include: { platformLinks: true } }),
    prisma.airingScheduleEntry.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, episode: true, airingAt: true, airDate: true, status: true } }).then(withAnilist),
  ]);
  const animeById = new Map(animes.map((a) => [a.anilistId, a]));
  const airingsById = new Map<number, Airing[]>();
  for (const a of airings) airingsById.set(a.anilistId, [...(airingsById.get(a.anilistId) ?? []), a]);

  const orphans = rows.filter((r) => !animeById.has(r.anilistId));
  if (orphans.length > 0) await prisma.pendingEpisode.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });

  const entries = rows
    .filter((r) => animeById.has(r.anilistId))
    .map((r) => {
      const anime = animeById.get(r.anilistId)!;
      const summary = summarizePending(airingsById.get(r.anilistId) ?? [], now);
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
        postponedAt: r.postponedAt.toISOString(),
        latestAired: summary.latestAired,
        latestAiredThisWeek: summary.latestAiredThisWeek,
        next: summary.next ? { episode: summary.next.episode, at: summary.next.at.toISOString() } : null,
        stillAiring: summary.next !== null || anime.status === "RELEASING",
        watchLinks: anime.platformLinks.map((l) => ({ platform: l.platform, url: l.url })),
      } satisfies PendingEntryDTO;
    });
  return entries.sort((a, b) => a.postponedAt.localeCompare(b.postponedAt));
}
