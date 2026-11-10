import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { receivedRecommendations, recommendTargets, recommendWork } from "@/lib/workRecommendations";

/**
 * Recomendações de obras entre amigos (10/11/2026).
 * GET `?obra=<chave>` → os amigos para escolher (com quem já recebeu e quem já acompanha); sem `obra` → o que recebi.
 * POST `{ to, work, note? }` → recomenda (só para amigo; uma vez por obra para a mesma pessoa; limite por dia).
 */
export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const work = new URL(request.url).searchParams.get("obra");
  if (work) return NextResponse.json({ friends: await recommendTargets(user.id, work) });
  return NextResponse.json({ received: await receivedRecommendations(user.id) });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { to?: unknown; work?: unknown; note?: unknown } | null;
  const result = await recommendWork(user.id, body ?? {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
