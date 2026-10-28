import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { buildAvatarOptions, isAllowedImage, type ImageKind } from "@/lib/avatarOptions";

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

/** Opções de avatar/banner: imagens (capa e personagens) das obras que a pessoa acompanha, agrupadas por obra. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const [groups, me] = await Promise.all([buildAvatarOptions(user.id), prisma.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true, bannerUrl: true } })]);
  return NextResponse.json({ groups, avatarUrl: me?.avatarUrl ?? null, bannerUrl: me?.bannerUrl ?? null });
}

/**
 * Escolhe o avatar (ou o banner) entre as imagens das obras acompanhadas: `{ kind, url }`.
 * `url: null` remove o banner. Qualquer URL fora das opções da pessoa é recusada.
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
  const kind: ImageKind | null = body.kind === "avatar" || body.kind === "banner" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

  if (body.url === null && kind === "banner") {
    await prisma.user.update({ where: { id: user.id }, data: { bannerUrl: null } });
    return NextResponse.json({ kind, url: null });
  }
  if (typeof body.url !== "string") return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });
  const groups = await buildAvatarOptions(user.id);
  if (!isAllowedImage(groups, kind, body.url)) {
    return NextResponse.json({ error: "Escolha uma imagem de uma obra que você acompanha." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: kind === "avatar" ? { avatarUrl: body.url } : { bannerUrl: body.url } });
  return NextResponse.json({ kind, url: body.url });
}
