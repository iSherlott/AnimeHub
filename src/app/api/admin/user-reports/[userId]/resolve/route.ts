import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";

type Params = { params: Promise<{ userId: string }> };

/**
 * Marca as denúncias do perfil como revisadas. Na v1 não há suspensão/
 * banimento (D-16 pendente): a decisão registrada é só "revisada" e fica
 * guardada em resolvedById/resolvedAt.
 */
export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { userId } = await params;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
  }

  await prisma.userReport.updateMany({
    where: { targetUserId: userId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: user.id },
  });
  return NextResponse.json({ ok: true });
}
