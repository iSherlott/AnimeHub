import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { reportProfileContent } from "@/lib/profileOrkut";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ albumId: string }> };

/** Denunciar um álbum (nome ou descrição): `{ reason }` (um dos motivos fixos). Vai para Admin → Acesso e moderação. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`profile-report:${user.id}`, 20, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const result = await reportProfileContent(user.id, "album", (await params).albumId, body?.reason);
  return result.ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
}
