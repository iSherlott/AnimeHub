import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isReportReason } from "@/lib/reportReasons";
import { clientIp, hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/**
 * Denunciar um PERFIL (alvo próprio, distinto de bloquear — Figma
 * `13:43571`). Privada; não bloqueia nem suspende; idempotente.
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limit = hitRateLimit(`report:${user.id}:${clientIp(request)}`, 30, 10 * 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSec);

  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "Você não pode denunciar a si mesmo" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (!body || !isReportReason(body.reason)) {
    return NextResponse.json({ error: "Escolha um motivo para a denúncia" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "Perfil indisponível" }, { status: 404 });
  }

  const report = await prisma.userReport.upsert({
    where: { targetUserId_reporterId: { targetUserId: id, reporterId: user.id } },
    create: { targetUserId: id, reporterId: user.id, reason: body.reason },
    update: { reason: body.reason, resolvedAt: null, resolvedById: null },
  });
  return NextResponse.json({ report: { id: report.id } }, { status: 201 });
}
