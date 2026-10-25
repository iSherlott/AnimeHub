import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { correspondenceImpact, decideCorrespondence, loadCorrespondence, type CorrespondenceAction, type CorrespondenceKind } from "@/lib/correspondences";

export const dynamic = "force-dynamic";

const KINDS = new Set(["import", "anidb"]);
const ACTIONS = new Set(["confirm", "reject", "later", "new", "relink"]);

/** Detalhe: os dois lados, o que coincide e diverge, e o impacto de confirmar. */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const { kind, id } = await params;
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  const row = await loadCorrespondence(kind as CorrespondenceKind, id);
  if (!row) return NextResponse.json({ error: "Correspondência não encontrada." }, { status: 404 });
  return NextResponse.json({ row, impact: await correspondenceImpact(row) }, { headers: { "Cache-Control": "no-store" } });
}

/** Decisão: `{ action: confirm|reject|later|new|relink, reason?, anilistId?, productionId? }`. Risco exige motivo. */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const { kind, id } = await params;
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown; anilistId?: unknown; productionId?: unknown } | null;
  if (typeof body?.action !== "string" || !ACTIONS.has(body.action)) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const anilistId = body.anilistId === undefined || body.anilistId === null || body.anilistId === "" ? null : Number(body.anilistId);
  if (anilistId !== null && (!Number.isInteger(anilistId) || anilistId < 1)) return NextResponse.json({ error: "Obra da AniList inválida." }, { status: 400 });
  const result = await decideCorrespondence(
    kind as CorrespondenceKind,
    id,
    { action: body.action as CorrespondenceAction, reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null, anilistId, productionId: typeof body.productionId === "string" ? body.productionId : null },
    { id: user.id, name: user.displayName }
  );
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
