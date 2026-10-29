import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { buildAvatarOptions, isAllowedImage, isImageKind, pageOfOptions } from "@/lib/avatarOptions";

/**
 * Envio de foto própria: desativado. O avatar e a capa do perfil são sempre imagens das obras que a pessoa
 * acompanha (escolhidas pelo PATCH abaixo). Fica a resposta 410 para clientes antigos.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ error: "O envio de foto própria foi desativado: escolha uma imagem de um anime que você acompanha." }, { status: 410 });
}

/** Remove o avatar (volta para a foto padrão) — sem isso, quem envia o
 * arquivo errado fica sem saída nenhuma pra reverter. */
export async function DELETE() {
  const { user, response } = await requireUser();
  if (!user) return response;

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });

  return NextResponse.json({ avatarUrl: null });
}

/**
 * Opções de avatar, banner e plano de fundo: imagens das obras que a pessoa acompanha, uma obra por grupo — capa e
 * personagens no avatar; banner e fundo só com imagens em Full HD. Sem `kind`, devolve todas as obras (`groups`); com `?kind=avatar|banner|background`, uma página do
 * seletor (`?q=` busca pelo título, `?page=` a partir de 0) com `total`, `page` e `pages`.
 */
export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  // Banner e fundo só mostram imagens em Full HD: mede na hora as que ainda não têm tamanho (uma vez por imagem).
  const [all, me] = await Promise.all([buildAvatarOptions(user.id, { measure: kind !== "avatar" }), prisma.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true, bannerUrl: true, backgroundUrl: true } })]);
  const current = { avatarUrl: me?.avatarUrl ?? null, bannerUrl: me?.bannerUrl ?? null, backgroundUrl: me?.backgroundUrl ?? null };
  if (!isImageKind(kind)) return NextResponse.json({ groups: all, ...current });
  const page = Number(searchParams.get("page"));
  return NextResponse.json({ ...pageOfOptions(all, kind, (searchParams.get("q") ?? "").slice(0, 80), Number.isInteger(page) ? page : 0), ...current });
}

/**
 * Escolhe o avatar, o banner ou o plano de fundo entre as imagens das obras acompanhadas: `{ kind, url }`.
 * `url: null` remove o banner ou o fundo. Qualquer URL fora das opções da pessoa é recusada.
 */
export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  let body: { kind?: unknown; url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const kind = isImageKind(body.kind) ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  const field = kind === "avatar" ? "avatarUrl" : kind === "banner" ? "bannerUrl" : "backgroundUrl";

  if (body.url === null && kind !== "avatar") {
    await prisma.user.update({ where: { id: user.id }, data: { [field]: null } });
    return NextResponse.json({ kind, url: null });
  }
  if (typeof body.url !== "string") return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });
  const groups = await buildAvatarOptions(user.id);
  if (!isAllowedImage(groups, kind, body.url)) {
    return NextResponse.json({ error: "Escolha uma imagem de uma obra que você acompanha." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { [field]: body.url } });
  return NextResponse.json({ kind, url: body.url });
}
