import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { markSystemAlertsRead } from "@/lib/systemAlerts";

type Params = { params: Promise<{ id: string }> };

/** Aviso do sistema lido por este admin (cada admin tem o próprio "lido"). */
export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;
  await markSystemAlertsRead(user.id, [id]);
  return NextResponse.json({ ok: true });
}
