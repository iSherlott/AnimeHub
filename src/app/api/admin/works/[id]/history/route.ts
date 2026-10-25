import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { changeHistory } from "@/lib/changeLog";

export const dynamic = "force-dynamic";

/** Histórico de alterações da obra (mais recente primeiro), 30 por página. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const page = Math.max(0, Number(new URL(request.url).searchParams.get("page")) || 0);
  return NextResponse.json(await changeHistory({ catalogEntryId: (await params).id }, page, 30), { headers: { "Cache-Control": "no-store" } });
}
