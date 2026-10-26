import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { scopeForKey, updateDescription } from "@/lib/community";

type Params = { params: Promise<{ key: string }> };

/** Descrição da comunidade (moderação): `{ description }`; vazio volta à sinopse da obra principal. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;
  const scope = await scopeForKey((await params).key);
  if (!scope) return NextResponse.json({ error: "Comunidade não encontrada." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { description?: unknown } | null;
  const result = await updateDescription(scope, body?.description);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
