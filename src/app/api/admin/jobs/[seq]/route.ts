import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { requestCancel } from "@/lib/jobLock";

export const dynamic = "force-dynamic";

/** O job (sem o HTML colado, que pode ser grande) e os logs dele. */
export async function GET(_request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Job inválido." }, { status: 400 });
  const job = await prisma.adminJob.findUnique({ where: { seq }, omit: { html: true } });
  if (!job) return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  const logs = await prisma.adminLog.findMany({ where: { jobSeq: seq }, orderBy: { at: "desc" }, take: 200 });
  return NextResponse.json({ job, logs }, { headers: { "Cache-Control": "no-store" } });
}

/** `{ action: "cancel" }`: pedido de cancelamento cooperativo (curadoria, linhas do tempo, tradução, AniList). */
export async function POST(request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Job inválido." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "cancel") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const result = await requestCancel(seq, user.displayName);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
