import { prisma } from "@/lib/prisma";
import { catalogEntryIdsFor } from "@/lib/catalogLink";
import { streamingDelays, tvAiringAt, withStreamingDelay } from "@/lib/streamingDelay";
import type { AniListAiringEntry } from "@/lib/anilist";
import type { AiringScheduleEntry } from "@prisma/client";
import { findStaleEntryIds } from "@/lib/airingRefresh";
import { isReschedule, recordRescheduleAlerts } from "@/lib/rescheduleAlerts";
import { recordChanges } from "@/lib/changeLog";
import { timed } from "@/lib/episodeState";
import { applyAiringOverrides, loadActiveOverrides } from "@/lib/airingOverrides";

export async function cacheAiringSchedule(entries: AniListAiringEntry[]): Promise<void> {
  // Atraso do streaming por obra (Epic 50): a agenda guarda o horário em que o episódio sai na plataforma.
  const delays = await streamingDelays(Array.from(new Set(entries.map((e) => e.anilistId))));
  // Identidade interna (Fase 2): o episódio aponta para a obra do catálogo; obra fora do catálogo fica sem vínculo.
  const catalogIds = await catalogEntryIdsFor(entries.map((e) => e.anilistId));
  for (const entry of entries) {
    const catalogEntryId = catalogIds.get(entry.anilistId);
    const data = {
      anilistId: entry.anilistId,
      ...(catalogEntryId ? { catalogEntryId } : {}),
      episode: entry.episode,
      airingAt: withStreamingDelay(new Date(entry.airingAt * 1000), delays.get(entry.anilistId)?.minutes),
      titleRomaji: entry.title.romaji,
      titleEnglish: entry.title.english,
      titleNative: entry.title.native,
      coverImage: entry.coverImage,
      bannerImage: entry.bannerImage,
      genres: entry.genres.join(","),
      description: entry.description,
    };
    const before = await prisma.airingScheduleEntry.findUnique({
      where: { anilistId_episode: { anilistId: entry.anilistId, episode: entry.episode } },
      select: { id: true, airingAt: true, manualFields: true },
    });
    // Episódio global (Fase 4): a AniList traz dia e hora (EXACT). Data ou situação corrigidas pelo admin não mudam.
    const manual = new Set(before?.manualFields ?? []);
    const dateLocked = manual.has("airingAt") || manual.has("airDate");
    const { airingAt, ...rest } = data;
    const dated = dateLocked ? {} : { airingAt, airDate: null, dateCertainty: "EXACT" };
    const reactivated = manual.has("status") ? {} : { status: "ACTIVE" };
    // Reagendamento de episódio acompanhado vira alerta "Data alterada"
    // (com o horário anterior) para quem segue a obra.
    if (before?.airingAt && !dateLocked && isReschedule(before.airingAt, airingAt)) {
      await recordRescheduleAlerts(entry.anilistId, entry.episode, before.airingAt, airingAt);
    }
    await prisma.airingScheduleEntry.upsert({
      where: { anilistId_episode: { anilistId: entry.anilistId, episode: entry.episode } },
      create: data,
      // fetchedAt só tinha default no create; sem isto nunca indicava frescor.
      update: { ...rest, ...dated, ...reactivated, fetchedAt: new Date() },
    });
    // Histórico de datas (Fase 4): a fonte mudou o horário — fica registrado de onde para onde, para auditoria.
    if (before && !dateLocked && before.airingAt?.getTime() !== airingAt.getTime()) {
      await recordChanges(prisma, { origin: "SOURCE", actor: { id: null, name: "AniList" }, entity: "AiringScheduleEntry", entityId: before.id, catalogEntryId: catalogEntryId ?? null, changes: [{ field: "airingAt", before: before.airingAt, after: airingAt }] });
      await flagOverrideConflict(entry.anilistId, entry.episode, entry.title.native ?? entry.title.romaji, airingAt);
    }
  }
}

/**
 * A fonte mudou o horário de um episódio que tem override do admin (Fase 5): a decisão foi tomada sobre o valor antigo.
 * Vira um conflito em Admin → Conflitos ("fonte nova" × "override"), um por episódio enquanto pendente; o calendário
 * continua usando o override até o admin decidir.
 */
async function flagOverrideConflict(anilistId: number, episode: number, title: string, sourceValue: Date): Promise<void> {
  const override = await prisma.catalogOverride.findFirst({ where: { anilistId, episode, field: "airingAt", removedAt: null }, orderBy: { createdAt: "desc" } });
  if (!override || override.value.getTime() === sourceValue.getTime()) return;
  const pending = await prisma.catalogConflict.findFirst({ where: { anilistId, episode, field: "airingAt", status: "PENDING" } });
  if (pending) {
    // Ainda pendente: só atualiza o valor novo da fonte (sem duplicar o conflito).
    if (pending.bSource === OVERRIDE_SOURCE && pending.aValue.getTime() !== sourceValue.getTime()) await prisma.catalogConflict.update({ where: { id: pending.id }, data: { aValue: sourceValue } });
    return;
  }
  await prisma.catalogConflict.create({
    data: {
      anilistId,
      episode,
      field: "airingAt",
      titleSnapshot: title,
      aValue: sourceValue,
      aSource: "AniList",
      bValue: override.value,
      bSource: OVERRIDE_SOURCE,
      bMeta: JSON.stringify({ overrideId: override.id, overrideReason: override.reason, overrideBy: override.adminName, previousSourceValue: override.originalValue.toISOString() }),
    },
  });
}

/** `bSource` do conflito "a fonte mudou depois do override": escolher a fonte (A) remove o override. */
export const OVERRIDE_SOURCE = "Override (admin)";

/**
 * Remove do cache os episódios FUTUROS da janela que a AniList deixou de
 * listar. Passado nunca é apagado (histórico). Chamar só após ler a janela
 * completa. Devolve quantas linhas saíram.
 */
export async function pruneMissingFutureEntries(
  fetched: AniListAiringEntry[],
  windowFrom: Date,
  windowTo: Date,
  now: Date = new Date()
): Promise<number> {
  const from = windowFrom > now ? windowFrom : now;
  const rows = timed(
    await prisma.airingScheduleEntry.findMany({
      where: { airingAt: { gte: from, lt: windowTo } },
      select: { id: true, anilistId: true, episode: true, airingAt: true },
    })
  );
  // A AniList lista pelo horário da TV; com atraso do streaming (Epic 50) o gravado vem depois. Só entra na conferência
  // o que, no horário da TV, também está dentro da janela lida — senão um episódio que já passou na TV, mas ainda vai
  // sair no streaming, seria apagado por "sumir" da AniList.
  const delays = await streamingDelays(Array.from(new Set(rows.map((r) => r.anilistId))));
  const existing = rows.filter((r) => tvAiringAt(r.airingAt, delays.get(r.anilistId)?.minutes) >= from);
  const staleIds = findStaleEntryIds(existing, fetched);
  if (staleIds.length === 0) return 0;
  // Episódio com conteúdo (título, sinopse, imagem) ou corrigido pelo admin não some (Fase 4): a fonte deixar de listar
  // não prova que ele deixou de existir — perde só a data (vira "data desconhecida") e o histórico fica.
  const keep = await prisma.airingScheduleEntry.findMany({
    where: { id: { in: staleIds }, OR: [{ episodeTitle: { not: null } }, { episodeTitleEn: { not: null } }, { episodeTitleJa: { not: null } }, { synopsis: { not: null } }, { thumbnail: { not: null } }, { manualFields: { isEmpty: false } }] },
    select: { id: true },
  });
  const keepIds = new Set(keep.map((k) => k.id));
  if (keepIds.size > 0) await prisma.airingScheduleEntry.updateMany({ where: { id: { in: [...keepIds] }, manualFields: { isEmpty: true } }, data: { airingAt: null, dateCertainty: "UNKNOWN" } });
  const result = await prisma.airingScheduleEntry.deleteMany({ where: { id: { in: staleIds.filter((id) => !keepIds.has(id)) } } });
  return result.count + keepIds.size;
}

export async function getCachedAiringSchedule(
  from: Date,
  to: Date
): Promise<TimedScheduleEntry[]> {
  // Horário EFETIVO (Fase 5): o override do admin vale sobre o da fonte — inclusive quando ele traz para dentro do
  // período um episódio que a fonte põe fora dele (ou leva para fora um que a fonte põe dentro).
  // Só entra episódio com dia e hora e sem adiamento/cancelamento informado (Fase 4).
  const moved = await prisma.catalogOverride.findMany({ where: { field: "airingAt", removedAt: null, value: { gte: from, lte: to } }, select: { anilistId: true, episode: true } });
  const rows = await prisma.airingScheduleEntry.findMany({
    where: { status: "ACTIVE", OR: [{ airingAt: { gte: from, lte: to } }, ...moved.map((m) => ({ anilistId: m.anilistId, episode: m.episode }))] },
    orderBy: { airingAt: "asc" },
  });
  const overrides = await loadActiveOverrides(Array.from(new Set(rows.map((r) => r.anilistId))));
  return timed(applyAiringOverrides(timed(rows), overrides))
    .filter((r) => r.airingAt >= from && r.airingAt <= to)
    .sort((a, b) => a.airingAt.getTime() - b.airingAt.getTime());
}

/** Linha da agenda com instante conhecido (a única que vai para o calendário). */
export type TimedScheduleEntry = AiringScheduleEntry & { airingAt: Date };
