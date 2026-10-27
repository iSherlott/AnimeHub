import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { decideTestimonial, deleteTestimonial } from "@/lib/profileSocial";

type Params = { params: Promise<{ testimonialId: string }> };

/** Aprovar ou recusar o depoimento recebido: `{ approve: boolean }`. */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (typeof body?.approve !== "boolean") return NextResponse.json({ error: "approve deve ser um booleano" }, { status: 400 });
  const result = await decideTestimonial((await params).testimonialId, user.id, body.approve);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}

/** Apagar: quem escreveu ou quem recebeu. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await deleteTestimonial((await params).testimonialId, user.id);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
