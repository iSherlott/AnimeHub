import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { report } from "@/lib/community";
import { rateLimitedResponse } from "@/lib/rateLimit";

/** Denunciar um tópico ou uma resposta da comunidade: `{ topicId | replyId, reason }`. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`community-report:${user.id}`, 20, 10 * 60_000);
  if (limited) return limited;
  const result = await report(user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
}
