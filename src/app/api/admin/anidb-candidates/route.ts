import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { confirmCandidate, listAnidbOnly, rejectCandidate } from "@/lib/anidbCandidates";

/** Admin → Match name → Obras sem página: lista (`?tab=suggested|none&page=`). */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") === "none" ? "none" : "suggested";
  return NextResponse.json(await listAnidbOnly(tab, Number(params.get("page")) || 0));
}

/** Decisão do admin: `confirm` (a sugerida, ou a escolhida em `anilistId`) ou `reject`. */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  let body: { anidbId?: unknown; action?: unknown; anilistId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const anidbId = Number(body.anidbId);
  if (!Number.isInteger(anidbId) || anidbId < 1) return NextResponse.json({ error: "Obra inválida." }, { status: 400 });
  const actor = { id: user.id, name: user.displayName };
  if (body.action === "reject") {
    const result = await rejectCandidate(anidbId, actor);
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (body.action === "confirm") {
    const anilistId = body.anilistId === undefined || body.anilistId === null ? null : Number(body.anilistId);
    if (anilistId !== null && (!Number.isInteger(anilistId) || anilistId < 1)) return NextResponse.json({ error: "Obra da AniList inválida." }, { status: 400 });
    const result = await confirmCandidate(anidbId, anilistId, actor);
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
