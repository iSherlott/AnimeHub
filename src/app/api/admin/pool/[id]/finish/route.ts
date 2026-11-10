import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { finishPool } from "@/lib/seasonPool";

type Params = { params: Promise<{ id: string }> };

/** Encerra o bolão: os pontos de cada escolha ficam gravados. */
export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;
  const result = await finishPool(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
