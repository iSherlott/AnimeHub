import { prisma } from "@/lib/prisma";
import { applyAiringOverrides, loadActiveOverrides } from "@/lib/airingOverrides";
import { myListStateOf, type MyListState } from "@/lib/myListState";

/** Uma obra acompanhada, com a situação de agenda já resolvida (Figma `8:2608`). */
export type MyListEntry = {
  id: string;
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  titlePortuguese: string | null;
  coverImage: string | null;
  isFavorite: boolean;
  createdAt: string;
  /** Próximo episódio com horário confirmado (atalho de `state.kind === "scheduled"`). */
  nextAiringAt: string | null;
  nextEpisode: number | null;
  /** Situação de lançamento da obra (AniList): RELEASING, NOT_YET_RELEASED, FINISHED… */
  status: string | null;
  state: MyListState;
};

/**
 * Lê a lista do usuário e resolve, por obra, o próximo horário confirmado ou
 * o motivo de não haver um (atrasado, adiado, sem horário, sem data). Só
 * leitura; nunca grava nada nem inventa data.
 */
export async function loadMyListEntries(userId: string, now: Date = new Date()): Promise<MyListEntry[]> {
  const animes = await prisma.anime.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      anilistId: true,
      titleRomaji: true,
      titleEnglish: true,
      titleNative: true,
      titlePortuguese: true,
      coverImage: true,
      isFavorite: true,
      createdAt: true,
      status: true,
    },
  });
  if (animes.length === 0) return [];

  const anilistIds = animes.map((a) => a.anilistId);
  // Próximo episódio com data confirmada de cada obra (um por obra).
  const upcomingRaw = await prisma.airingScheduleEntry.findMany({
    where: { anilistId: { in: anilistIds }, airingAt: { gte: now } },
    orderBy: { airingAt: "asc" },
    select: { anilistId: true, episode: true, airingAt: true },
  });
  // Horário efetivo: overrides manuais (Admin → Overrides) valem sobre o da fonte.
  const upcoming = applyAiringOverrides(upcomingRaw, await loadActiveOverrides(anilistIds)).sort((a, b) => a.airingAt.getTime() - b.airingAt.getTime());
  const nextById = new Map<number, { episode: number; airingAt: Date }>();
  for (const entry of upcoming) if (!nextById.has(entry.anilistId)) nextById.set(entry.anilistId, entry);

  const catalog = await prisma.catalogEntry.findMany({
    where: { anilistId: { in: anilistIds } },
    select: { anilistId: true, status: true, startDate: true, nextEpisodeNumber: true, nextEpisodeAt: true },
  });
  const catalogById = new Map(catalog.map((c) => [c.anilistId as number, c]));

  return animes.map((a) => {
    const next = nextById.get(a.anilistId) ?? null;
    const row = catalogById.get(a.anilistId) ?? null;
    return {
      id: a.id,
      anilistId: a.anilistId,
      titleRomaji: a.titleRomaji,
      titleEnglish: a.titleEnglish,
      titleNative: a.titleNative,
      titlePortuguese: a.titlePortuguese,
      coverImage: a.coverImage,
      isFavorite: a.isFavorite,
      createdAt: a.createdAt.toISOString(),
      nextAiringAt: next ? next.airingAt.toISOString() : null,
      nextEpisode: next ? next.episode : null,
      status: row?.status ?? a.status ?? null,
      state: myListStateOf({
        upcoming: next ? { airingAt: next.airingAt, episode: next.episode } : null,
        catalog: row ? { status: row.status ?? a.status ?? null, startDate: row.startDate, nextEpisodeNumber: row.nextEpisodeNumber, nextEpisodeAt: row.nextEpisodeAt } : a.status ? { status: a.status, startDate: null, nextEpisodeNumber: null, nextEpisodeAt: null } : null,
        now,
      }),
    };
  });
}
