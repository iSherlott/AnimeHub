import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { addFriend, removeFriend } from "@/lib/friends";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

/** "Adicionar como amigo": envia o pedido (ou aceita o que a outra pessoa já mandou). 30 por minuto por conta. */
export async function PUT(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`friend:${user.id}`, 30, 60_000);
  if (limited) return limited;
  const result = await addFriend(user.id, (await params).id);
  return result.ok ? NextResponse.json({ state: result.state }) : NextResponse.json({ error: result.error }, { status: result.status });
}

/** Cancela o pedido enviado, recusa o recebido ou desfaz a amizade. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await removeFriend(user.id, (await params).id);
  return result.ok ? NextResponse.json({ state: result.state }) : NextResponse.json({ error: result.error }, { status: result.status });
}
