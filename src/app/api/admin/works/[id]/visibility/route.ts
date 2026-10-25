import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { setVisibility, visibilityImpact } from "@/lib/catalogEdit";

export const dynamic = "force-dynamic";

/** O impacto de tirar a obra da plataforma: quem acompanha, episódios futuros, páginas e publicações ligadas. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const impact = await visibilityImpact((await params).id);
  if (!impact) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
  return NextResponse.json(impact);
}

/** Publica ou despublica (`{ onPlatform, reason }`). Nada é apagado: a obra só deixa de aparecer. Motivo obrigatório para despublicar. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { onPlatform?: unknown; reason?: unknown } | null;
  if (typeof body?.onPlatform !== "boolean") return NextResponse.json({ error: "Informe onPlatform (true ou false)." }, { status: 400 });
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  if (!body.onPlatform && !reason) return NextResponse.json({ error: "Diga o motivo para tirar a obra da plataforma." }, { status: 400 });
  const entry = await setVisibility((await params).id, body.onPlatform, reason, { id: user.id, name: user.displayName });
  if (!entry) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
  return NextResponse.json({ id: entry.id, onPlatform: entry.onPlatform, updatedAt: entry.updatedAt });
}
