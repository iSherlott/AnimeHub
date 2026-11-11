import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { votePostPoll } from "@/lib/postPolls";

type Params = { params: Promise<{ postId: string }> };

/** Votar na enquete da publicação (12/11/2026): POST `{ optionId }`; votar de novo troca o voto enquanto está aberta. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { optionId?: unknown } | null;
  if (typeof body?.optionId !== "string") return NextResponse.json({ error: "Escolha uma opção." }, { status: 400 });
  const result = await votePostPoll((await params).postId, user.id, body.optionId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ poll: result.poll });
}
