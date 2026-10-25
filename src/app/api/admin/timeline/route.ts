import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { aliveExclusiveJob } from "@/lib/jobLock";
import { auditTimelines, getTimelineStatus } from "@/lib/curation/timelineAudit";

export const dynamic = "force-dynamic";

/** Admin → Curadoria: andamento da auditoria das linhas do tempo (nomes, ordem cronológica das franquias e obras repetidas). */
export async function GET() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  return NextResponse.json(await getTimelineStatus(), { headers: { "Cache-Control": "no-store" } });
}

/** Inicia a auditoria em segundo plano. Responde 202; 409 se já houver uma rodando. */
export async function POST() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  // Fase 8: vivo = rodando com sinal de vida recente (o início em si é atômico, em startExclusiveJob).
  const alive = await aliveExclusiveJob("TIMELINE");
  if (alive) {
    return NextResponse.json({ error: "Já existe uma auditoria em andamento.", seq: alive.seq }, { status: 409 });
  }
  void auditTimelines({ actor: { id: user.id, name: user.displayName } }).catch((error) => console.error("[linha do tempo] auditoria falhou:", error));
  return NextResponse.json({ started: true }, { status: 202 });
}
