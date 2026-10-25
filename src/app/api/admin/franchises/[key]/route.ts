import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { loadFranchise, saveFranchiseOrder, undoFranchiseBatch, type OrderItem } from "@/lib/franchiseAdmin";

export const dynamic = "force-dynamic";

const keyOf = async (params: Promise<{ key: string }>) => {
  const key = Number((await params).key);
  return Number.isInteger(key) ? key : null;
};

/** A franquia: obras em ordem, relações suspeitas e os últimos salvamentos (para desfazer). */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const key = await keyOf(params);
  if (key === null) return NextResponse.json({ error: "Franquia inválida." }, { status: 400 });
  return NextResponse.json(await loadFranchise(key), { headers: { "Cache-Control": "no-store" } });
}

/** `{ action: "save", items: [{ id, timelineOrder, timelineRole, timelineSeason }], reason? }` · `{ action: "undo", batchId }`. */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const key = await keyOf(params);
  if (key === null) return NextResponse.json({ error: "Franquia inválida." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; items?: unknown; reason?: unknown; batchId?: unknown } | null;
  const actor = { id: user.id, name: user.displayName };
  if (body?.action === "save" && Array.isArray(body.items)) {
    const items = body.items.filter((i): i is OrderItem => typeof i === "object" && i !== null && typeof (i as OrderItem).id === "string");
    const result = await saveFranchiseOrder(key, items, typeof body.reason === "string" ? body.reason.slice(0, 500) : null, actor);
    return result.ok ? NextResponse.json({ changed: result.changed, batchId: result.batchId }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (body?.action === "undo" && typeof body.batchId === "string") {
    const result = await undoFranchiseBatch(key, body.batchId, actor);
    return result.ok ? NextResponse.json({ changed: result.changed }) : NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
