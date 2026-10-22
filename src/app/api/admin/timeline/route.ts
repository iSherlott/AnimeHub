import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { auditTimelines, getTimelineStatus } from "@/lib/curation/timelineAudit";

export const dynamic = "force-dynamic";

/** Admin → Curadoria: andamento da auditoria das linhas do tempo (nomes, ordem cronológica das franquias e obras repetidas). */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json(await getTimelineStatus(), { headers: { "Cache-Control": "no-store" } });
}

/** Inicia a auditoria em segundo plano. Responde 202; 409 se já houver uma rodando. */
export async function POST() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const status = await getTimelineStatus();
  if (status.job?.state === "RUNNING" && status.progress && Date.now() - Date.parse(status.progress.updatedAt) < 10 * 60 * 1000) {
    return NextResponse.json({ error: "Já existe uma auditoria em andamento.", seq: status.job.seq }, { status: 409 });
  }
  void auditTimelines({ actor: { id: user.id, name: user.displayName } }).catch((error) => console.error("[linha do tempo] auditoria falhou:", error));
  return NextResponse.json({ started: true }, { status: 202 });
}
