import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";

/** Acima disto sem um ciclo "OK" o job é considerado atrasado (o loader roda a cada ~30 min). */
const STALE_AFTER_MS: Record<string, number> = { "calendar-loader": 3 * 3600 * 1000 };

/**
 * Admin → Execuções/Logs (ADMIN-003/004): últimas execuções dos serviços de
 * dados e um resumo por fonte (última execução, último sucesso, atraso).
 * Somente leitura.
 */
export async function GET(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 30));

  const runs = await prisma.ingestionRun.findMany({
    where: source ? { source } : {},
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  const sources = await prisma.ingestionRun.findMany({ distinct: ["source"], select: { source: true } });
  const now = Date.now();
  const summary = await Promise.all(
    sources.map(async ({ source: name }) => {
      const [last, lastOk] = await Promise.all([
        prisma.ingestionRun.findFirst({ where: { source: name }, orderBy: { startedAt: "desc" } }),
        prisma.ingestionRun.findFirst({ where: { source: name, status: "OK" }, orderBy: { startedAt: "desc" } }),
      ]);
      const limitMs = STALE_AFTER_MS[name];
      return {
        source: name,
        lastStatus: last?.status ?? null,
        lastRunAt: last?.startedAt.toISOString() ?? null,
        lastSuccessAt: lastOk?.startedAt.toISOString() ?? null,
        stale: limitMs ? !lastOk || now - lastOk.startedAt.getTime() > limitMs : false,
      };
    })
  );

  return NextResponse.json({
    summary,
    runs: runs.map((r) => ({
      id: r.id,
      source: r.source,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      durationMs: r.finishedAt.getTime() - r.startedAt.getTime(),
      itemsProcessed: r.itemsProcessed,
      itemsFailed: r.itemsFailed,
      message: r.message,
    })),
  });
}
