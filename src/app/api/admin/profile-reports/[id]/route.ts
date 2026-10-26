import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { resolveProfileReport } from "@/lib/profileOrkut";

type Params = { params: Promise<{ id: string }> };

/** Resolver a denúncia (moderação): `{ action: "remove" | "keep" }`. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "remove" && body?.action !== "keep") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const result = await resolveProfileReport((await params).id, body.action, user.id);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
