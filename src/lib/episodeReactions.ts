import { prisma } from "@/lib/prisma";
import { resolveWorkKey } from "@/lib/workRef";

/**
 * Reação, nota e diário por episódio (10/11/2026):
 * - reação (um emoji da lista) e nota de 1 a 5: somam na curva da temporada, que todo mundo vê (só números);
 * - diário: um comentário curto, só da pessoa (não aparece para ninguém, nem como spoiler).
 * Só episódios que já foram ao ar (o calendário diz quando).
 */
export const REACTION_EMOJIS = ["🔥", "😭", "😂", "😱", "❤️", "🤯", "😴"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export const NOTE_MAX = 280;

export type EpisodeStat = { episode: number; reactions: number; ratings: number; avgRating: number | null; topEmojis: { emoji: string; count: number }[] };
export type MyEpisodeEntry = { episode: number; emoji: string | null; rating: number | null; note: string | null; updatedAt: string };

/** A parte pura: soma das reações de cada episódio (só os números; nunca quem reagiu nem o diário). */
export function aggregateEpisodes(rows: { episode: number; emoji: string | null; rating: number | null }[]): EpisodeStat[] {
  const byEpisode = new Map<number, { reactions: number; ratings: number[]; emojis: Map<string, number> }>();
  for (const row of rows) {
    const stat = byEpisode.get(row.episode) ?? { reactions: 0, ratings: [] as number[], emojis: new Map<string, number>() };
    if (row.emoji) {
      stat.reactions += 1;
      stat.emojis.set(row.emoji, (stat.emojis.get(row.emoji) ?? 0) + 1);
    }
    if (row.rating !== null) stat.ratings.push(row.rating);
    byEpisode.set(row.episode, stat);
  }
  return [...byEpisode]
    .map(([episode, s]) => ({
      episode,
      reactions: s.reactions,
      ratings: s.ratings.length,
      avgRating: s.ratings.length ? Math.round((s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) * 10) / 10 : null,
      topEmojis: [...s.emojis].map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)).slice(0, 3),
    }))
    .filter((s) => s.reactions > 0 || s.ratings > 0)
    .sort((a, b) => a.episode - b.episode);
}

export type ReactionInput = { work?: unknown; episode?: unknown; emoji?: unknown; rating?: unknown; note?: unknown };
export type ReactionResult = { ok: true; entry: MyEpisodeEntry | null } | { ok: false; status: 400 | 404 | 409; error: string };

/** Quais episódios da obra já foram ao ar (pelo calendário: horário ou, sem ele, o dia). */
export async function airedEpisodes(ref: { anilistId: number | null; catalogEntryId: string | null }, now = new Date()): Promise<Set<number>> {
  const rows = await prisma.airingScheduleEntry.findMany({
    where: { status: "ACTIVE", ...(ref.anilistId !== null ? { anilistId: ref.anilistId } : { catalogEntryId: ref.catalogEntryId }) },
    select: { episode: true, airingAt: true, airDate: true },
  });
  return new Set(rows.filter((r) => (r.airingAt ?? r.airDate) !== null && (r.airingAt ?? r.airDate)!.getTime() <= now.getTime()).map((r) => r.episode));
}

/** Grava (ou apaga, se vier tudo vazio) o registro da pessoa para um episódio. */
export async function saveEpisodeReaction(userId: string, input: ReactionInput, now = new Date()): Promise<ReactionResult> {
  const work = await resolveWorkKey(typeof input.work === "string" || typeof input.work === "number" ? input.work : null);
  if (!work) return { ok: false, status: 404, error: "Obra não encontrada." };
  const episode = Number(input.episode);
  if (!Number.isInteger(episode) || episode < 1 || episode > 9999) return { ok: false, status: 400, error: "Episódio inválido." };
  const emoji = input.emoji === null || input.emoji === undefined || input.emoji === "" ? null : String(input.emoji);
  if (emoji !== null && !(REACTION_EMOJIS as readonly string[]).includes(emoji)) return { ok: false, status: 400, error: "Reação inválida." };
  const rating = input.rating === null || input.rating === undefined || input.rating === "" ? null : Number(input.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return { ok: false, status: 400, error: "A nota vai de 1 a 5." };
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > NOTE_MAX) return { ok: false, status: 400, error: `O diário pode ter até ${NOTE_MAX} caracteres.` };
  if (!(await airedEpisodes(work, now)).has(episode)) return { ok: false, status: 409, error: "Este episódio ainda não foi ao ar." };

  const key = { userId_workKey_episode: { userId, workKey: work.key, episode } };
  if (emoji === null && rating === null && !note) {
    await prisma.episodeReaction.deleteMany({ where: { userId, workKey: work.key, episode } });
    return { ok: true, entry: null };
  }
  const data = { emoji, rating, note: note || null };
  const row = await prisma.episodeReaction.upsert({ where: key, create: { userId, workKey: work.key, episode, ...data }, update: data });
  return { ok: true, entry: { episode: row.episode, emoji: row.emoji, rating: row.rating, note: row.note, updatedAt: row.updatedAt.toISOString() } };
}

/** A curva da obra (todos) e o registro da pessoa (o diário só dela). */
export async function loadEpisodeReactions(workKey: string, viewerId: string | null): Promise<{ stats: EpisodeStat[]; mine: MyEpisodeEntry[]; aired: number[] } | null> {
  const work = await resolveWorkKey(workKey);
  if (!work) return null;
  const [rows, mine, aired] = await Promise.all([
    prisma.episodeReaction.findMany({ where: { workKey: work.key }, select: { episode: true, emoji: true, rating: true } }),
    viewerId ? prisma.episodeReaction.findMany({ where: { workKey: work.key, userId: viewerId }, orderBy: { episode: "asc" } }) : Promise.resolve([]),
    airedEpisodes(work),
  ]);
  return {
    stats: aggregateEpisodes(rows),
    mine: mine.map((m) => ({ episode: m.episode, emoji: m.emoji, rating: m.rating, note: m.note, updatedAt: m.updatedAt.toISOString() })),
    aired: [...aired].sort((a, b) => a - b),
  };
}
