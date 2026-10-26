import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createReply } from "@/lib/community";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ topicId: string }> };

/** Responder ao tópico: `{ body, isSpoiler? }`. Só membros da comunidade. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`community-reply:${user.id}`, 60, 10 * 60_000);
  if (limited) return limited;
  const result = await createReply((await params).topicId, user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ replyId: result.replyId }, { status: 201 }) : NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
}
