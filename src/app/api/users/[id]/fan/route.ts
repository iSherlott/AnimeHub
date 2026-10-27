import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { setFan } from "@/lib/profileSocial";

type Params = { params: Promise<{ id: string }> };

/** Ser fã / deixar de ser: `{ fan: boolean }`. */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (typeof body?.fan !== "boolean") return NextResponse.json({ error: "fan deve ser um booleano" }, { status: 400 });
  const result = await setFan(user.id, (await params).id, body.fan);
  return result.ok ? NextResponse.json({ fan: body.fan, fans: result.fans }) : NextResponse.json({ error: result.error }, { status: result.status });
}
