import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listMutes, MAX_MUTES, parseMute } from "@/lib/mutes";

/**
 * Silenciar no Feed (12/11/2026).
 * GET → o que a pessoa silenciou. POST `{ kind: "WORK"|"TAG", key, label? }` → silencia. DELETE `?kind=&key=` → volta a mostrar.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ mutes: await listMutes(user.id) });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const mute = parseMute(((await request.json().catch(() => null)) as Record<string, unknown> | null) ?? {});
  if (!mute) return NextResponse.json({ error: "Escolha uma obra ou uma # para silenciar." }, { status: 400 });
  if ((await prisma.mutedTopic.count({ where: { userId: user.id } })) >= MAX_MUTES) return NextResponse.json({ error: `Você já silenciou ${MAX_MUTES} itens. Libere algum em Configurações.` }, { status: 409 });
  await prisma.mutedTopic.upsert({ where: { userId_kind_key: { userId: user.id, kind: mute.kind, key: mute.key } }, create: { userId: user.id, ...mute }, update: { label: mute.label } });
  return NextResponse.json({ ok: true, ...mute }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const mute = parseMute({ kind: params.get("kind"), key: params.get("key") });
  if (!mute) return NextResponse.json({ error: "Item inválido." }, { status: 400 });
  await prisma.mutedTopic.deleteMany({ where: { userId: user.id, kind: mute.kind, key: mute.key } });
  return NextResponse.json({ ok: true });
}
