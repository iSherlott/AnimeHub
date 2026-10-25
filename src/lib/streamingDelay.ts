import { timed } from "@/lib/episodeState";
import { prisma } from "@/lib/prisma";

/**
 * Atraso do streaming por obra (Epic 50). A AniList (e o AniDB) dão o horário da TV japonesa; a pessoa assiste na
 * plataforma de streaming (Crunchyroll, por exemplo), que costuma liberar o episódio uma ou duas horas depois. O admin
 * diz, por obra, quanto depois sai no streaming; a agenda (AiringScheduleEntry) e o próximo episódio do catálogo passam a
 * guardar o horário do streaming, então calendário, sino, "próximo episódio" e Explorar mostram o mesmo horário. O
 * horário da TV continua recuperável: é o gravado menos o atraso.
 */
export const MAX_STREAMING_DELAY_MINUTES = 24 * 60;

/** Horário do streaming a partir do horário da fonte (TV japonesa). */
export function withStreamingDelay(sourceAt: Date, minutes: number | null | undefined): Date {
  return minutes ? new Date(sourceAt.getTime() + minutes * 60_000) : sourceAt;
}

/** Horário da TV japonesa a partir do horário gravado (que já tem o atraso). */
export function tvAiringAt(storedAt: Date, minutes: number | null | undefined): Date {
  return minutes ? new Date(storedAt.getTime() - minutes * 60_000) : storedAt;
}

/** Atrasos das obras pedidas (só as que têm atraso). */
export async function streamingDelays(anilistIds: number[]): Promise<Map<number, { minutes: number; site: string | null }>> {
  if (anilistIds.length === 0) return new Map();
  const rows = await prisma.catalogEntry.findMany({
    where: { anilistId: { in: anilistIds }, streamingDelayMinutes: { not: null } },
    select: { anilistId: true, streamingDelayMinutes: true, streamingSite: true },
  });
  return new Map(rows.filter((r) => r.streamingDelayMinutes).map((r) => [r.anilistId as number, { minutes: r.streamingDelayMinutes as number, site: r.streamingSite }]));
}

export function parseStreamingDelay(input: unknown): { anilistId: number; minutes: number | null; site: string | null } | null {
  const body = input as { anilistId?: unknown; minutes?: unknown; site?: unknown } | null;
  if (!body || !Number.isInteger(body.anilistId) || (body.anilistId as number) <= 0) return null;
  const minutes = body.minutes === null || body.minutes === 0 ? null : body.minutes;
  if (minutes !== null && (!Number.isInteger(minutes) || (minutes as number) < -MAX_STREAMING_DELAY_MINUTES || (minutes as number) > MAX_STREAMING_DELAY_MINUTES)) return null;
  if (body.site !== undefined && body.site !== null && (typeof body.site !== "string" || body.site.trim().length > 40)) return null;
  const site = typeof body.site === "string" && body.site.trim() ? body.site.trim() : null;
  return { anilistId: body.anilistId as number, minutes: minutes as number | null, site: minutes === null ? null : site };
}

/**
 * Grava (ou tira, com `minutes` nulo) o atraso de uma obra e desloca o que já está gravado pela diferença: os episódios
 * da agenda e o próximo episódio do catálogo. Os overrides manuais (Admin → Overrides) não mudam: valem como estão.
 */
export async function setStreamingDelay({ anilistId, minutes, site }: { anilistId: number; minutes: number | null; site: string | null }): Promise<{ episodes: number } | null> {
  const entry = await prisma.catalogEntry.findUnique({ where: { anilistId }, select: { id: true, streamingDelayMinutes: true, nextEpisodeAt: true } });
  if (!entry) return null;
  const delta = (minutes ?? 0) - (entry.streamingDelayMinutes ?? 0);
  return prisma.$transaction(async (tx) => {
    await tx.catalogEntry.update({
      where: { id: entry.id },
      data: { streamingDelayMinutes: minutes, streamingSite: site, ...(delta && entry.nextEpisodeAt ? { nextEpisodeAt: new Date(entry.nextEpisodeAt.getTime() + delta * 60_000) } : {}) },
    });
    if (delta === 0) return { episodes: 0 };
    // Só horários da fonte (com instante): o que o admin corrigiu à mão não é deslocado.
    const rows = timed(await tx.airingScheduleEntry.findMany({ where: { anilistId, NOT: { manualFields: { has: "airingAt" } } }, select: { id: true, airingAt: true } }));
    for (const row of rows) await tx.airingScheduleEntry.update({ where: { id: row.id }, data: { airingAt: new Date(row.airingAt.getTime() + delta * 60_000) } });
    return { episodes: rows.length };
  });
}
