import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createRecommendationLink } from "@/lib/recommendationLinks";

/**
 * Recomendar por link (11/11/2026), para quem não tem conta: POST `{ work, note? }` → `{ url: "/r/<código>" }`.
 * Um link por pessoa e obra; gerar de novo atualiza o bilhete e devolve o mesmo endereço.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { work?: unknown; note?: unknown } | null;
  const result = await createRecommendationLink(user.id, body ?? {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: `/r/${result.code}` }, { status: 201 });
}
