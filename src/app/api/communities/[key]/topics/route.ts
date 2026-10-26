import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createTopic, scopeForKey } from "@/lib/community";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ key: string }> };

/** Novo tópico: `{ title, body, isSpoiler?, catalogEntryId? (obra da franquia de que fala), poll?: string[] }`. Só membros. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`community-topic:${user.id}`, 10, 10 * 60_000);
  if (limited) return limited;
  const scope = await scopeForKey((await params).key);
  if (!scope) return NextResponse.json({ error: "Comunidade não encontrada." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const result = await createTopic(scope, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
  return NextResponse.json({ topicId: result.topicId, key: scope.key }, { status: 201 });
}
