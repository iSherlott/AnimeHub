import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { isRole, ROLE_LABELS } from "@/lib/auth/permissions";
import { recordChanges } from "@/lib/changeLog";

/**
 * Muda o papel de uma pessoa (Fase 9): `{ role: ADMIN | CURATOR | MODERATOR | MEMBER }`. Só administrador; ninguém muda
 * o próprio papel; o sistema nunca fica sem administrador. Fica no log e no histórico.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const id = (await params).id;
  const body = (await request.json().catch(() => null)) as { role?: unknown } | null;
  if (!isRole(body?.role)) return NextResponse.json({ error: "Papel inválido." }, { status: 400 });
  const role = body.role;
  if (id === user.id) return NextResponse.json({ error: "Você não pode mudar o próprio papel." }, { status: 409 });
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, displayName: true } });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (target.role === role) return NextResponse.json({ ok: true, role });
  if (target.role === "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN" } })) <= 1) return NextResponse.json({ error: "O sistema não pode ficar sem administrador." }, { status: 409 });
  await prisma.user.update({ where: { id }, data: { role } });
  await recordChanges(prisma, { origin: "ADMIN", actor: { id: user.id, name: user.displayName }, entity: "User", entityId: id, changes: [{ field: "role", before: target.role, after: role }] });
  await prisma.adminLog.create({ data: { level: "WARN", event: "Role changed", message: `${user.displayName} mudou o papel de ${target.displayName}: ${ROLE_LABELS[target.role as keyof typeof ROLE_LABELS] ?? target.role} → ${ROLE_LABELS[role]}.`, context: `user:${id}`, adminName: user.displayName } });
  return NextResponse.json({ ok: true, role });
}
