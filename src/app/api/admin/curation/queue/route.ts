import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { loadQueue, parseQueueFilters, queueIndicators } from "@/lib/curation/queue";

export const dynamic = "force-dynamic";

/** Fila de pendências (Fase 7): filtros (`tipo, prioridade, fonte, estado, de, ate, q, pagina`) e indicadores. */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const f = parseQueueFilters(new URL(request.url).searchParams);
  const [queue, indicators] = await Promise.all([loadQueue(f), queueIndicators()]);
  return NextResponse.json({ ...queue, indicators }, { headers: { "Cache-Control": "no-store" } });
}
