import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { validateEvent } from "@/lib/animeEvents";

type Params = { params: Promise<{ id: string }> };

/** Edita um evento da agenda (mesmos campos do cadastro). */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;
  const parsed = validateEvent((await request.json().catch(() => null)) ?? {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const updated = await prisma.animeEvent.updateMany({ where: { id, deletedAt: null }, data: parsed.value });
  if (updated.count === 0) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Tira o evento da agenda (fica guardado, sem aparecer). */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;
  const updated = await prisma.animeEvent.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (updated.count === 0) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
