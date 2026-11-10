import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { parseSeasonInput, publishTierList, saveTierList } from "@/lib/tierList";

/**
 * Tier list da temporada (10/11/2026).
 * PUT `{ season, seasonYear, tiers }` → salva (só obras da temporada que a pessoa acompanha).
 * POST `{ season, seasonYear }` → publica no Feed.
 */
export async function PUT(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { season?: unknown; seasonYear?: unknown; tiers?: unknown } | null;
  const season = parseSeasonInput(body?.season, body?.seasonYear);
  if (!season) return NextResponse.json({ error: "Temporada inválida." }, { status: 400 });
  return NextResponse.json({ tiers: await saveTierList(user.id, season, body?.tiers) });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { season?: unknown; seasonYear?: unknown } | null;
  const season = parseSeasonInput(body?.season, body?.seasonYear);
  if (!season) return NextResponse.json({ error: "Temporada inválida." }, { status: 400 });
  const result = await publishTierList(user.id, season);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ postId: result.postId }, { status: 201 });
}
