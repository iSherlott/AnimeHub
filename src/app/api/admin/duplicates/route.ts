import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { dismissDuplicate, listDuplicateReview, mergeDuplicate } from "@/lib/curation/duplicateReview";

export const dynamic = "force-dynamic";

/** Admin → Curadoria: pares de obras que a auditoria suspeita serem a mesma, para o admin decidir. */
export async function GET() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  return NextResponse.json({ pairs: await listDuplicateReview() }, { headers: { "Cache-Control": "no-store" } });
}

/** Decisão do admin: `merge` (`{ anidbId, anilistId }`: a cópia do AniDB vira a obra da AniList) ou `dismiss` (`{ entryIds }`: não é a mesma obra). */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  let body: { action?: unknown; anidbId?: unknown; anilistId?: unknown; entryIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const actor = { id: user.id, name: user.displayName };
  if (body.action === "merge") {
    const anidbId = Number(body.anidbId);
    const anilistId = Number(body.anilistId);
    if (!Number.isInteger(anidbId) || anidbId < 1 || !Number.isInteger(anilistId) || anilistId < 1) return NextResponse.json({ error: "Obras inválidas." }, { status: 400 });
    const result = await mergeDuplicate(anidbId, anilistId, actor);
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (body.action === "dismiss") {
    const ids = Array.isArray(body.entryIds) ? body.entryIds.filter((id): id is string => typeof id === "string" && /^[a-z0-9]{10,40}$/.test(id)) : [];
    if (ids.length < 1 || ids.length > 10) return NextResponse.json({ error: "Informe as obras do par." }, { status: 400 });
    return NextResponse.json({ ok: true, dismissed: await dismissDuplicate(ids, actor) });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
