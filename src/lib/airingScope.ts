import { prisma } from "@/lib/prisma";
import type { AniListAiringEntry } from "@/lib/anilist";
import { platformAnilistIds } from "@/lib/platform";

/**
 * Escopo do calendário: só entram episódios de obras da PLATAFORMA (as que o admin trouxe: upload do HTML do AniDB
 * ou painel de importação da AniList, mais as que alguém já acompanha). Sem este filtro o loader gravava tudo o
 * que a AniList exibia na janela (animes de longa duração, cours de temporadas fechadas, conteúdo adulto).
 */

/** Mantém só os episódios de obras no escopo; devolve também quantos ficaram de fora. */
export function filterToScope(entries: AniListAiringEntry[], allowedIds: ReadonlySet<number>): { kept: AniListAiringEntry[]; skipped: number } {
  const kept = entries.filter((e) => allowedIds.has(e.anilistId));
  return { kept, skipped: entries.length - kept.length };
}

export type AiringScope = { allowedIds: Set<number> };

/**
 * anilistIds da plataforma. A AniList NÃO é consultada para completar o catálogo: sem obras na plataforma o ciclo
 * falha com mensagem, em vez de gravar tudo.
 */
export async function loadAiringScope(): Promise<AiringScope> {
  const allowedIds = await platformAnilistIds();
  if (allowedIds.size === 0) throw new Error("Nenhuma obra na plataforma: traga uma temporada (upload do HTML do AniDB) antes de carregar o calendário.");
  return { allowedIds };
}

/** Episódios no cache de calendário de obras que NÃO fazem parte da plataforma (limpeza). */
export async function outOfScopeAiring(scope: AiringScope): Promise<Array<{ anilistId: number; titleRomaji: string; episodes: number }>> {
  const groups = await prisma.airingScheduleEntry.groupBy({
    by: ["anilistId", "titleRomaji"],
    where: { anilistId: { notIn: Array.from(scope.allowedIds) } },
    _count: { _all: true },
    orderBy: { titleRomaji: "asc" },
  });
  return groups.map((g) => ({ anilistId: g.anilistId, titleRomaji: g.titleRomaji, episodes: g._count._all }));
}
