import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const alert = await prisma.airingAlert.findUnique({ where: { id } });
  if (!alert || alert.userId !== user.id) {
    return NextResponse.json({ error: "Alerta não encontrado" }, { status: 404 });
  }

  await prisma.airingAlert.update({ where: { id }, data: { seenAt: new Date() } });
  return NextResponse.json({ ok: true });
}
