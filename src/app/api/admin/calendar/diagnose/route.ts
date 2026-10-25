import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { diagnoseWork } from "@/lib/calendarDiagnosis";

export const dynamic = "force-dynamic";

/**
 * "Por que não apareceu na agenda?" (Fase 5): `{ workId? , q?, user? }` — `user` é o @ ou o e-mail da pessoa (no corpo,
 * nunca na URL). Só lê: devolve as verificações e a explicação provável.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { workId?: unknown; q?: unknown; user?: unknown } | null;
  const workId = typeof body?.workId === "string" && /^[a-z0-9]{8,40}$/i.test(body.workId) ? body.workId : undefined;
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 120) : undefined;
  const person = typeof body?.user === "string" && body.user.trim() ? body.user.trim().slice(0, 200) : undefined;
  if (!workId && !q) return NextResponse.json({ error: "Informe a obra (título, AniList ID ou ID do catálogo)." }, { status: 400 });
  return NextResponse.json(await diagnoseWork({ workId, q, user: person }), { headers: { "Cache-Control": "no-store" } });
}
