import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { ANIDB_BATCH_MAX, anidbEpisodesStatus, startAnidbEpisodesJob } from "@/lib/anidbEpisodes";

export const dynamic = "force-dynamic";

/** Episódios das obras só do AniDB: quantas obras, quantas já têm episódios, último lote. */
export async function GET() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  return NextResponse.json(await anidbEpisodesStatus(), { headers: { "Cache-Control": "no-store" } });
}

/** Inicia o lote (`{ limit? }`, até 300 obras): um por vez, em segundo plano, com intervalo entre as consultas. */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const status = await anidbEpisodesStatus();
  if (!status.configured) return NextResponse.json({ error: "AniDB não configurada no servidor (ANIDB_CLIENT_NAME e ANIDB_CLIENT_VERSION)." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = Number.isInteger(body.limit) && (body.limit as number) >= 1 ? Math.min(body.limit as number, ANIDB_BATCH_MAX) : 100;
  const started = await startAnidbEpisodesJob({ id: user.id, name: user.displayName }, limit);
  if ("running" in started) return NextResponse.json({ error: "Já há um lote do AniDB em andamento.", seq: started.running }, { status: 409 });
  return NextResponse.json({ seq: started.seq }, { status: 202 });
}
