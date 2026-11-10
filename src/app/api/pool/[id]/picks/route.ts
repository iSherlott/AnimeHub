import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { togglePick } from "@/lib/seasonPool";

type Params = { params: Promise<{ id: string }> };

/** `{ workKey, picked }`: escolhe ou tira uma obra do meu bolão (até o limite e até o prazo). */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { workKey?: unknown; picked?: unknown } | null;
  const result = await togglePick(user.id, id, typeof body?.workKey === "string" ? body.workKey : "", body?.picked !== false);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ picks: result.picks });
}
