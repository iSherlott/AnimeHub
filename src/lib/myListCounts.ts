import { PAUSED_CATEGORY, loadProfileAnimeList } from "@/lib/profileAnimeList";

/** Quantas obras estão na aba Pausados de Meus Animes (a mesma conta da página, para o número da aba bater). */
export async function pausedCount(userId: string): Promise<number> {
  const result = await loadProfileAnimeList(userId, userId, "", "", PAUSED_CATEGORY, { offset: 0, limit: 1 });
  return result.kind === "ok" ? result.list.matched : 0;
}
