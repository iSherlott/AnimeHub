import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { applyFieldUpdate, FIELD_UPDATE_SOURCES, parseDiff, parseSelected, previewFieldUpdate, retryFieldUpdate, selectFields, sourceOfJob } from "@/lib/fieldUpdate";

export const dynamic = "force-dynamic";

async function seqOf(params: Promise<{ seq: string }>): Promise<number | null> {
  const seq = Number((await params).seq);
  return Number.isInteger(seq) && seq > 0 ? seq : null;
}

/** O lote: itens com as diferenças campo a campo, o que está escolhido e a prévia. */
export async function GET(_request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const seq = await seqOf(params);
  if (!seq) return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job || job.kind !== "FIELD_UPDATE") return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
  const items = await prisma.fieldUpdateItem.findMany({ where: { jobSeq: seq }, orderBy: { title: "asc" } });
  return NextResponse.json(
    {
      job: { seq: job.seq, state: job.state, stage: job.stage, label: job.season, source: FIELD_UPDATE_SOURCES[sourceOfJob(job.source)].label, processed: job.processed, total: job.total, progressNote: job.progressNote, createdAt: job.createdAt, adminName: job.adminName, result: job.resultJson ? JSON.parse(job.resultJson) : null },
      items: items.map((i) => ({ id: i.id, catalogEntryId: i.catalogEntryId, anilistId: i.anilistId, title: i.title, state: i.state, message: i.message, diff: parseDiff(i), selected: parseSelected(i), collectedAt: i.collectedAt })),
      preview: await previewFieldUpdate(seq),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Ações do lote: `{ action: "select", fields, includeProtected?, perItem? }` · `{ action: "apply", confirm? }` ·
 * `{ action: "retry" }`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const seq = await seqOf(params);
  if (!seq) return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; fields?: unknown; includeProtected?: unknown; perItem?: unknown; confirm?: unknown } | null;
  if (body?.action === "select") {
    if (!Array.isArray(body.fields)) return NextResponse.json({ error: "Informe os campos." }, { status: 400 });
    const perItem = body.perItem && typeof body.perItem === "object" ? Object.fromEntries(Object.entries(body.perItem as Record<string, unknown>).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === "string")])) : undefined;
    const result = await selectFields(seq, { fields: body.fields.filter((x): x is string => typeof x === "string"), includeProtected: body.includeProtected === true, perItem });
    return result.ok ? NextResponse.json({ selected: result.selected, preview: await previewFieldUpdate(seq) }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (body?.action === "apply") {
    const result = await applyFieldUpdate(seq, body.confirm === true, { id: user.id, name: user.displayName });
    return result.ok ? NextResponse.json({ result: result.result }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (body?.action === "retry") {
    const result = await retryFieldUpdate(seq);
    return result.ok ? NextResponse.json({ retried: result.retried }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
