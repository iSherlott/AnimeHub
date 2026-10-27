import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { deleteScrap } from "@/lib/profileSocial";

type Params = { params: Promise<{ scrapId: string }> };

/** Apagar o recado: quem recebeu, quem escreveu ou a equipe de moderação. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await deleteScrap((await params).scrapId, { id: user.id, canModerate: can(user.role, "moderation") });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
