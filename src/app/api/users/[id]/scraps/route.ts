import { NextResponse } from "next/server";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { createScrap, listScraps } from "@/lib/profileOrkut";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/** Recados do perfil, mais recentes primeiro (`?page=`). */
export async function GET(request: Request, { params }: Params) {
  const viewer = await getCurrentUser();
  const page = Math.max(0, Number(new URL(request.url).searchParams.get("page")) || 0);
  const { total, rows } = await listScraps((await params).id, page, viewer?.id ?? null);
  return NextResponse.json({ total, page, scraps: rows });
}

/** Deixar um recado: `{ body }`. 20 por minuto por conta. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`scrap:${user.id}`, 20, 60_000);
  if (limited) return limited;
  const result = await createScrap((await params).id, user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ id: result.id }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
}
