import type { EpisodeExtra } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diffFields, recordChanges, type ChangeActor } from "@/lib/changeLog";

/**
 * Edição de um extra do AniDB (especial, abertura, trailer…). Mesmas regras do episódio, sem o que não se aplica:
 *  - versão otimista (`expectedUpdatedAt`): se o extra mudou depois de aberto, 409 com os valores atuais;
 *  - o código (S1, C2…) e a obra são a identidade e não se editam aqui;
 *  - o que o admin corrige fica protegido contra o AniDB (`manualFields`), salvo se desmarcar;
 *  - cada campo alterado vai para o histórico da obra (entidade `EpisodeExtra`).
 */
export const EXTRA_EDITABLE = ["title", "titleEn", "titleJa", "synopsis", "airDate"] as const;
export type ExtraEditable = (typeof EXTRA_EDITABLE)[number];

export const EXTRA_FIELD_LABELS: Record<ExtraEditable, string> = {
  title: "Título (romaji)",
  titleEn: "Título (inglês)",
  titleJa: "Título (japonês)",
  synopsis: "Sinopse",
  airDate: "Dia",
};

type Parsed = Partial<{ title: string | null; titleEn: string | null; titleJa: string | null; synopsis: string | null; airDate: Date | null }>;

export function validateExtraEdit(input: unknown): { ok: true; value: { expected: Date; data: Parsed; reason: string | null; protect: boolean; unprotect: string[] } } | { ok: false; errors: Record<string, string> } {
  const body = (input ?? {}) as { expectedUpdatedAt?: unknown; changes?: unknown; reason?: unknown; protect?: unknown; unprotect?: unknown };
  const errors: Record<string, string> = {};
  const expected = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
  if (!expected || Number.isNaN(expected.getTime())) errors.expectedUpdatedAt = "versão do extra ausente (recarregue a página)";
  const changes = body.changes && typeof body.changes === "object" ? (body.changes as Record<string, unknown>) : {};
  const data: Parsed = {};
  for (const [field, v] of Object.entries(changes)) {
    switch (field) {
      case "title":
      case "titleEn":
      case "titleJa":
      case "synopsis": {
        const max = field === "synopsis" ? 10_000 : 300;
        if (v === null || (typeof v === "string" && v.trim() === "")) data[field] = null;
        else if (typeof v === "string" && v.trim().length <= max) data[field] = v.trim();
        else errors[field] = `até ${max.toLocaleString("pt-BR")} caracteres`;
        break;
      }
      case "airDate":
        if (v === null || v === "") data.airDate = null;
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v) data.airDate = new Date(`${v}T00:00:00Z`);
        else errors.airDate = "data no formato AAAA-MM-DD";
        break;
      default:
        errors[field] = "campo não editável";
    }
  }
  const editable = new Set<string>(EXTRA_EDITABLE);
  const unprotect = Array.isArray(body.unprotect) ? body.unprotect.filter((f): f is string => typeof f === "string" && editable.has(f)) : [];
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  if (Object.keys(data).length === 0 && unprotect.length === 0 && Object.keys(errors).length === 0) errors.changes = "nada para alterar";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { expected: expected as Date, data, reason, protect: body.protect !== false, unprotect } };
}

export type ExtraEditResult = { ok: true; extra: EpisodeExtra; changed: string[] } | { ok: false; status: 400 | 404 | 409; error: string; errors?: Record<string, string>; current?: EpisodeExtra };

export async function editExtra(id: string, input: unknown, actor: ChangeActor): Promise<ExtraEditResult> {
  const parsed = validateExtraEdit(input);
  if (!parsed.ok) return { ok: false, status: 400, error: "Corrija os campos indicados.", errors: parsed.errors };
  const { expected, data, reason, protect, unprotect } = parsed.value;

  return prisma.$transaction(async (tx) => {
    const row = await tx.episodeExtra.findUnique({ where: { id } });
    if (!row) return { ok: false as const, status: 404 as const, error: "Extra não encontrado." };
    if (row.updatedAt.getTime() !== expected.getTime()) return { ok: false as const, status: 409 as const, error: "O extra mudou depois que você abriu a página. Revise os valores atuais.", current: row };

    const diff = diffFields(row as unknown as Record<string, unknown>, data as Record<string, unknown>);
    const changed = diff.map((c) => c.field);
    const manual = new Set(row.manualFields);
    const newManual = new Set(manual);
    if (protect) for (const f of changed) newManual.add(f);
    for (const f of unprotect) newManual.delete(f);
    const manualChanged = newManual.size !== manual.size || [...newManual].some((f) => !manual.has(f));
    if (changed.length === 0 && !manualChanged) return { ok: false as const, status: 400 as const, error: "Nada mudou.", errors: { changes: "os valores são os mesmos" } };

    const extra = await tx.episodeExtra.update({
      where: { id },
      data: { ...Object.fromEntries(changed.map((f) => [f, data[f as ExtraEditable] ?? null])), ...(manualChanged ? { manualFields: [...newManual] } : {}) },
    });
    await recordChanges(tx, {
      origin: "ADMIN",
      actor,
      entity: "EpisodeExtra",
      entityId: id,
      catalogEntryId: row.catalogEntryId,
      changes: [...diff, ...(manualChanged ? [{ field: "manualFields", before: row.manualFields, after: [...newManual] }] : [])],
      reason,
    });
    return { ok: true as const, extra, changed };
  });
}
