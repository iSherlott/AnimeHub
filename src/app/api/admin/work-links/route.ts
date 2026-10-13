import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { decideWorkLink, loadWorkLinkPanel, removeWorkLink } from "@/lib/workLinkActions";

/** Admin → Match name: o que parece continuação pelo nome e o que já foi decidido. */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json(await loadWorkLinkPanel());
}

/** Confirma ("é continuação") ou recusa ("não é") um par de obras; também serve à junção manual. */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  let body: { earlierAnilistId?: unknown; laterAnilistId?: unknown; decision?: unknown; origin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const earlier = Number(body.earlierAnilistId);
  const later = Number(body.laterAnilistId);
  if (!Number.isInteger(earlier) || !Number.isInteger(later) || earlier < 1 || later < 1) return NextResponse.json({ error: "Informe as duas obras." }, { status: 400 });
  if (body.decision !== "confirm" && body.decision !== "reject") return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });

  const result = await decideWorkLink(
    { earlierAnilistId: earlier, laterAnilistId: later, decision: body.decision, origin: body.origin === "MANUAL" ? "MANUAL" : "SUGGESTED" },
    { id: user.id, name: user.displayName }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

/** Desfaz uma decisão (`?id=`): a ligação confirmada separa as franquias; a recusa deixa a sugestão voltar. */
export async function DELETE(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe a ligação." }, { status: 400 });
  const result = await removeWorkLink(id, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
