import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { dismissIssue, reopenIssue, resolveIssue } from "@/lib/curation/queue";

export const dynamic = "force-dynamic";

/** `{ action: "resolve", reason? }` · `{ action: "dismiss", reason }` · `{ action: "reopen" }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const id = (await params).id;
  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
  const actor = { id: user.id, name: user.displayName };
  let result;
  if (body?.action === "resolve") result = await resolveIssue(id, reason, actor);
  else if (body?.action === "dismiss") result = await dismissIssue(id, reason ?? "", actor);
  else if (body?.action === "reopen") result = await reopenIssue(id, actor);
  else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
