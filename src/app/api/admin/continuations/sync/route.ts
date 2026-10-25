import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { backfillEarlierSeasons, syncContinuations } from "@/lib/continuation";

/** Admin: procura agora obras que voltaram a sair episódios e completa as temporadas anteriores de quem acompanha uma mais nova (o notificador também faz isso a cada poucos minutos). */
export async function POST() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const summary = await syncContinuations();
  summary.backfilled += await backfillEarlierSeasons();
  return NextResponse.json(summary);
}
