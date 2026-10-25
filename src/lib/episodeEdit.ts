import type { AiringScheduleEntry, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diffFields, recordChanges, type ChangeActor } from "@/lib/changeLog";
import { certaintyFor, EPISODE_STATUSES } from "@/lib/episodeState";
import { isReschedule, recordRescheduleAlerts } from "@/lib/rescheduleAlerts";

/**
 * Edição do episódio global (Fase 4). Regras:
 *  - versão otimista (`expectedUpdatedAt`): se o episódio mudou depois de aberto, 409 com os valores atuais;
 *  - número e obra são a identidade do episódio: trocar exige justificativa e não pode colidir com outro episódio;
 *  - data: se a fonte informou dia e hora, a correção vira um override (a fonte continua atualizando por baixo e o
 *    original fica guardado); sem horário da fonte, a data é gravada no próprio episódio e protegida;
 *  - mudança de data de episódio acompanhado gera o aviso "Data alterada" (uma vez: o aviso é único por episódio);
 *  - o que o admin corrige fica protegido contra Kitsu/AniDB/AniList (`manualFields`), salvo se desmarcar.
 */
export const EPISODE_TEXT_FIELDS = ["episodeTitle", "episodeTitleEn", "episodeTitleJa", "synopsis", "thumbnail"] as const;
export const EPISODE_EDITABLE = [...EPISODE_TEXT_FIELDS, "status", "airingAt", "airDate", "episode", "workId"] as const;
export type EpisodeEditable = (typeof EPISODE_EDITABLE)[number];
/** Campos que exigem justificativa. */
const NEEDS_REASON: ReadonlySet<string> = new Set(["episode", "workId", "status", "airingAt", "airDate"]);
/** Campos que podem ser protegidos (vêm de fontes). Número e obra não vêm de fonte nenhuma depois de criados. */
const PROTECTABLE = new Set<string>([...EPISODE_TEXT_FIELDS, "status", "airingAt", "airDate"]);

export const EPISODE_FIELD_LABELS: Record<EpisodeEditable, string> = {
  episodeTitle: "Título (romaji)",
  episodeTitleEn: "Título (inglês)",
  episodeTitleJa: "Título (japonês)",
  synopsis: "Sinopse",
  thumbnail: "Imagem",
  status: "Situação",
  airingAt: "Dia e hora",
  airDate: "Só o dia",
  episode: "Número",
  workId: "Obra",
};

type Parsed = Partial<{ episodeTitle: string | null; episodeTitleEn: string | null; episodeTitleJa: string | null; synopsis: string | null; thumbnail: string | null; status: string; airingAt: Date | null; airDate: Date | null; episode: number; workId: string }>;

export type EpisodeEditInput = { expectedUpdatedAt: string; changes: Record<string, unknown>; reason?: string | null; protect?: boolean; unprotect?: string[] };

export function validateEpisodeEdit(input: unknown): { ok: true; value: { expected: Date; data: Parsed; reason: string | null; protect: boolean; unprotect: string[] } } | { ok: false; errors: Record<string, string> } {
  const body = (input ?? {}) as Partial<EpisodeEditInput>;
  const errors: Record<string, string> = {};
  const expected = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
  if (!expected || Number.isNaN(expected.getTime())) errors.expectedUpdatedAt = "versão do episódio ausente (recarregue a página)";
  const changes = body.changes && typeof body.changes === "object" ? body.changes : {};
  const data: Parsed = {};
  const text = (field: (typeof EPISODE_TEXT_FIELDS)[number], v: unknown, max: number) => {
    if (v === null || (typeof v === "string" && v.trim() === "")) data[field] = null;
    else if (typeof v === "string" && v.trim().length <= max) data[field] = v.trim();
    else errors[field] = `até ${max.toLocaleString("pt-BR")} caracteres`;
  };
  for (const [field, v] of Object.entries(changes)) {
    switch (field) {
      case "episodeTitle":
      case "episodeTitleEn":
      case "episodeTitleJa":
        text(field, v, 300);
        break;
      case "synopsis":
        text(field, v, 10_000);
        break;
      case "thumbnail":
        if (v === null || v === "") data.thumbnail = null;
        else if (typeof v === "string" && v.length <= 500 && /^https?:\/\/\S+$/.test(v.trim())) data.thumbnail = v.trim();
        else errors.thumbnail = "endereço http(s)";
        break;
      case "status":
        if (typeof v === "string" && (EPISODE_STATUSES as readonly string[]).includes(v)) data.status = v;
        else errors.status = `um de ${EPISODE_STATUSES.join(", ")}`;
        break;
      case "airingAt": {
        // Instante com fuso explícito (ISO com Z ou ±hh:mm): nunca um horário "solto" interpretado no fuso do servidor.
        if (v === null || v === "") data.airingAt = null;
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v))) data.airingAt = new Date(v);
        else errors.airingAt = "data e hora com fuso (ISO 8601)";
        break;
      }
      case "airDate": {
        if (v === null || v === "") data.airDate = null;
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v) data.airDate = new Date(`${v}T00:00:00Z`);
        else errors.airDate = "data no formato AAAA-MM-DD";
        break;
      }
      case "episode":
        if (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5000) data.episode = v as number;
        else errors.episode = "número inteiro de 1 a 5000";
        break;
      case "workId":
        if (typeof v === "string" && /^[a-z0-9]{8,40}$/i.test(v)) data.workId = v;
        else errors.workId = "obra inválida";
        break;
      default:
        errors[field] = "campo não editável";
    }
  }
  const unprotect = Array.isArray(body.unprotect) ? body.unprotect.filter((f): f is string => typeof f === "string" && PROTECTABLE.has(f)) : [];
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  if (Object.keys(data).length === 0 && unprotect.length === 0 && Object.keys(errors).length === 0) errors.changes = "nada para alterar";
  const important = Object.keys(data).filter((f) => NEEDS_REASON.has(f));
  if (important.length > 0 && (!reason || reason.length < 3)) errors.reason = `diga o motivo (obrigatório para ${important.map((f) => EPISODE_FIELD_LABELS[f as EpisodeEditable].toLowerCase()).join(", ")})`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { expected: expected as Date, data, reason, protect: body.protect !== false, unprotect } };
}

export type EpisodeEditResult =
  | { ok: true; entry: AiringScheduleEntry; changed: string[]; override: boolean; alerts: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string; errors?: Record<string, string>; current?: AiringScheduleEntry };

export async function editEpisode(id: string, input: unknown, actor: ChangeActor): Promise<EpisodeEditResult> {
  const parsed = validateEpisodeEdit(input);
  if (!parsed.ok) return { ok: false, status: 400, error: "Corrija os campos indicados.", errors: parsed.errors };
  const { expected, data, reason, protect, unprotect } = parsed.value;

  const outcome = await prisma.$transaction(async (tx) => {
    const row = await tx.airingScheduleEntry.findUnique({ where: { id } });
    if (!row) return { ok: false as const, status: 404 as const, error: "Episódio não encontrado." };
    if (row.updatedAt.getTime() !== expected.getTime()) return { ok: false as const, status: 409 as const, error: "O episódio mudou depois que você abriu a página. Revise os valores atuais.", current: row };

    // Identidade: obra e número.
    let target: { id: string; anilistId: number; titleRomaji: string; titleEnglish: string | null; titleNative: string | null } | null = null;
    if (data.workId && data.workId !== row.catalogEntryId) {
      const work = await tx.catalogEntry.findUnique({ where: { id: data.workId }, select: { id: true, anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true } });
      if (!work) return { ok: false as const, status: 400 as const, error: "Obra de destino não encontrada.", errors: { workId: "obra não encontrada" } };
      if (work.anilistId === null) return { ok: false as const, status: 400 as const, error: "A obra de destino não tem AniList ID: ainda não pode receber episódios.", errors: { workId: "obra sem AniList ID" } };
      target = { ...work, anilistId: work.anilistId };
    }
    const anilistId = target?.anilistId ?? row.anilistId;
    const number = data.episode ?? row.episode;
    if (anilistId !== row.anilistId || number !== row.episode) {
      const clash = await tx.airingScheduleEntry.findUnique({ where: { anilistId_episode: { anilistId, episode: number } }, select: { id: true } });
      if (clash) return { ok: false as const, status: 409 as const, error: `A obra já tem o episódio ${number}. Corrija ou junte os dois antes.`, errors: { episode: "número já existe nesta obra" } };
    }

    // Data: override quando a fonte informou dia e hora (e o admin não tinha assumido a data); senão, no próprio episódio.
    const manual = new Set(row.manualFields);
    const sourceTimed = row.airingAt !== null && !manual.has("airingAt") && row.source !== "manual";
    let useOverride = false;
    const patch: Prisma.AiringScheduleEntryUncheckedUpdateInput = {};
    for (const f of EPISODE_TEXT_FIELDS) if (f in data) patch[f] = data[f] ?? null;
    if (data.status) patch.status = data.status;
    const before = await tx.catalogOverride.findFirst({ where: { anilistId: row.anilistId, episode: row.episode, field: "airingAt", removedAt: null }, orderBy: { createdAt: "desc" } });
    const effectiveBefore = before?.value ?? row.airingAt;
    let effectiveAfter = effectiveBefore;
    if ("airingAt" in data) {
      if (data.airingAt && sourceTimed) {
        useOverride = true;
        effectiveAfter = data.airingAt;
      } else {
        patch.airingAt = data.airingAt ?? null;
        effectiveAfter = data.airingAt ?? null;
      }
    }
    if ("airDate" in data) patch.airDate = data.airDate ?? null;
    if ("airingAt" in data || "airDate" in data) {
      const nextAiring = "airingAt" in patch ? (patch.airingAt as Date | null) : row.airingAt;
      const nextDate = "airDate" in patch ? (patch.airDate as Date | null) : row.airDate;
      patch.dateCertainty = certaintyFor(nextAiring, nextDate);
    }
    if (target) {
      patch.anilistId = target.anilistId;
      patch.catalogEntryId = target.id;
      patch.titleRomaji = target.titleRomaji;
      patch.titleEnglish = target.titleEnglish;
      patch.titleNative = target.titleNative;
    }
    if (data.episode !== undefined) patch.episode = data.episode;

    const changedFields = Object.keys(data).filter((f) => {
      if (f === "workId") return target !== null;
      if (f === "airingAt") return (effectiveBefore?.getTime() ?? null) !== (effectiveAfter?.getTime() ?? null);
      const current = (row as Record<string, unknown>)[f];
      const next = (data as Record<string, unknown>)[f];
      return current instanceof Date || next instanceof Date ? (current as Date | null)?.getTime() !== (next as Date | null)?.getTime() : current !== next;
    });
    const newManual = new Set(manual);
    if (protect) for (const f of changedFields) if (PROTECTABLE.has(f) && !(f === "airingAt" && useOverride)) newManual.add(f);
    for (const f of unprotect) newManual.delete(f);
    const manualChanged = newManual.size !== manual.size || [...newManual].some((f) => !manual.has(f));
    if (changedFields.length === 0 && !manualChanged) return { ok: false as const, status: 400 as const, error: "Nada mudou.", errors: { changes: "os valores são os mesmos" } };
    if (manualChanged) patch.manualFields = [...newManual];

    if (useOverride && data.airingAt) {
      await tx.catalogOverride.updateMany({ where: { anilistId: row.anilistId, episode: row.episode, field: "airingAt", removedAt: null }, data: { removedAt: new Date(), removedByName: actor.name } });
      await tx.catalogOverride.create({
        data: { anilistId: row.anilistId, episode: row.episode, field: "airingAt", titleSnapshot: row.titleNative ?? row.titleRomaji, originalValue: row.airingAt as Date, originalSource: row.source === "anilist" ? "AniList" : row.source, value: data.airingAt, reason: reason ?? "", adminName: actor.name ?? "admin" },
      });
    }
    // Override e imagem do calendário seguem o episódio quando ele muda de obra ou de número.
    if (anilistId !== row.anilistId || number !== row.episode) {
      await tx.catalogOverride.updateMany({ where: { anilistId: row.anilistId, episode: row.episode, removedAt: null }, data: { anilistId, episode: number } });
    }
    const entry = await tx.airingScheduleEntry.update({ where: { id }, data: patch });

    const diff = diffFields(
      { ...Object.fromEntries(changedFields.map((f) => [f, f === "workId" ? row.catalogEntryId : f === "airingAt" ? effectiveBefore : (row as Record<string, unknown>)[f]])) },
      { ...Object.fromEntries(changedFields.map((f) => [f, f === "workId" ? target?.id : f === "airingAt" ? effectiveAfter : (data as Record<string, unknown>)[f]])) }
    );
    await recordChanges(tx, {
      origin: "ADMIN",
      actor,
      entity: "AiringScheduleEntry",
      entityId: id,
      catalogEntryId: entry.catalogEntryId,
      changes: [...diff, ...(manualChanged ? [{ field: "manualFields", before: row.manualFields, after: [...newManual] }] : []), ...(useOverride ? [{ field: "override", before: before?.value ?? null, after: data.airingAt }] : [])],
      reason,
    });
    return { ok: true as const, entry, changed: changedFields, override: useOverride, before: effectiveBefore, after: effectiveAfter, moved: anilistId !== row.anilistId || number !== row.episode };
  });

  if (!outcome.ok) return { ok: false, status: outcome.status, error: outcome.error, errors: "errors" in outcome ? (outcome.errors as Record<string, string> | undefined) : undefined, current: "current" in outcome ? outcome.current : undefined };
  // Aviso "Data alterada" a quem acompanha (fora da transação: o aviso é único por episódio, então repetir não duplica).
  let alerts = false;
  if (!outcome.moved && outcome.before && outcome.after && isReschedule(outcome.before, outcome.after)) {
    await recordRescheduleAlerts(outcome.entry.anilistId, outcome.entry.episode, outcome.before, outcome.after);
    alerts = true;
  }
  return { ok: true, entry: outcome.entry, changed: outcome.changed, override: outcome.override, alerts };
}
