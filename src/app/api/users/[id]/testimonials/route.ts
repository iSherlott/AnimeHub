import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { writeTestimonial } from "@/lib/profileOrkut";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/** Escrever (ou reescrever) o depoimento para um amigo: `{ body }`. Volta a esperar a aprovação. */
export async function PUT(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`testimonial:${user.id}`, 10, 60_000);
  if (limited) return limited;
  const result = await writeTestimonial((await params).id, user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
