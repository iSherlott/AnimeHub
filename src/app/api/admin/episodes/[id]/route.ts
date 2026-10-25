import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { loadEpisodeDetail } from "@/lib/adminEpisodes";
import { editEpisode } from "@/lib/episodeEdit";

export const dynamic = "force-dynamic";

/** Detalhe do episódio: obra, data efetiva (com override), duplicados possíveis e histórico. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const detail = await loadEpisodeDetail((await params).id);
  if (!detail) return NextResponse.json({ error: "Episódio não encontrado." }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Edita o episódio: `{ expectedUpdatedAt, changes: { campo: valor }, reason?, protect? (padrão true), unprotect? }`.
 * 400 com erros por campo (motivo obrigatório para número, obra, situação e data); 404; 409 se o episódio mudou depois de
 * aberto (com os valores atuais) ou se o número já existe na obra.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const result = await editEpisode((await params).id, body, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors, current: result.current }, { status: result.status });
  return NextResponse.json({ entry: result.entry, changed: result.changed, override: result.override, alerts: result.alerts });
}
