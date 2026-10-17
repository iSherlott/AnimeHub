import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { relinkAnidbOnlyEntries } from "@/lib/adminImport/relink";
import { logEvent } from "@/lib/adminImport/pipeline";

/**
 * Admin: religa à AniList as obras que só existem pelo AniDB (sem página) e que casam com segurança com uma obra do
 * catálogo. `?dryRun=true` só mostra o que seria ligado, sem gravar nada; `?live=true` também consulta a busca da AniList
 * (uma consulta por obra, ~1 s cada: pode levar vários minutos).
 */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const dryRun = params.get("dryRun") === "true";
  const live = params.get("live") === "true";
  const result = await relinkAnidbOnlyEntries({ dryRun, live });
  if (!dryRun) {
    await logEvent({
      source: "AniDB",
      event: "Relink",
      message: `${result.linked.length} obra(s) só do AniDB ligadas à AniList${live ? " (com busca na AniList)" : ""} · ${result.uncertain} incertas · ${result.withoutCandidate} sem candidato.`,
      context: `Catálogo · ${result.examined} examinadas`,
      actor: { id: user.id, name: user.displayName },
    });
  }
  return NextResponse.json({ dryRun, live, ...result });
}
