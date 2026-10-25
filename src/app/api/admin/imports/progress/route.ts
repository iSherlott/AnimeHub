import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

/**
 * Andamento de uma carga para a tela mostrar o que está acontecendo.
 *  - `?seq=12`: o lote indicado (commit / reaplicar).
 *  - `?since=<ms>`: o lote que esta pessoa começou a analisar depois desse instante (a análise ainda não devolveu o número).
 *  - `&kind=ANILIST`: o mesmo, para as operações do painel da AniList (buscar, trazer, complementar).
 */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const seq = Number(searchParams.get("seq"));
  const since = Number(searchParams.get("since"));
  const kind = searchParams.get("kind") === "ANILIST" ? "ANILIST" : "IMPORT";
  const select = { seq: true, state: true, stage: true, total: true, processed: true, progressNote: true } as const;

  const job = Number.isInteger(seq) && seq > 0
    ? await prisma.adminJob.findUnique({ where: { seq }, select })
    : Number.isFinite(since) && since > 0
      ? await prisma.adminJob.findFirst({ where: { adminId: user.id, kind, createdAt: { gte: new Date(since - 2000) } }, orderBy: { seq: "desc" }, select })
      : null;

  if (!job) return NextResponse.json({ active: false });
  return NextResponse.json({ active: job.progressNote !== null, seq: job.seq, state: job.state, stage: job.stage, total: job.total, processed: job.processed, note: job.progressNote });
}
