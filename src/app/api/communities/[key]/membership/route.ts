import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { join, leave, scopeForKey } from "@/lib/community";

type Params = { params: Promise<{ key: string }> };

/** Entrar na comunidade do anime (`key` = AniList ID de qualquer obra da franquia ou `anidb-<id>`). */
export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const scope = await scopeForKey((await params).key);
  if (!scope) return NextResponse.json({ error: "Comunidade não encontrada." }, { status: 404 });
  await join(scope, user.id);
  return NextResponse.json({ member: true, key: scope.key });
}

/** Sair da comunidade: os tópicos e respostas da pessoa ficam. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const scope = await scopeForKey((await params).key);
  if (!scope) return NextResponse.json({ error: "Comunidade não encontrada." }, { status: 404 });
  await leave(scope, user.id);
  return NextResponse.json({ member: false, key: scope.key });
}
