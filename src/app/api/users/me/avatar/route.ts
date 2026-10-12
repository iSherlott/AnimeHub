import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { MAX_REQUEST_BYTES, MAX_UPLOAD_BYTES } from "@/lib/uploadValidation";
import { processImageUpload } from "@/lib/processImageUpload";
import { hitRateLimit, tooManyRequests } from "@/lib/rateLimit";
import { buildAvatarOptions, isAllowedImage, type ImageKind } from "@/lib/avatarOptions";

const MAX_DIMENSION = 512;

/**
 * Upload de avatar (Epic 28) — reaproveita o mesmo pipeline de
 * validação/reencode do upload de post (src/app/api/uploads/route.ts,
 * via src/lib/processImageUpload.ts), só que grava em
 * `storage/uploads/avatars/` com dimensão menor (avatar nunca precisa
 * da resolução de uma imagem de post) e atualiza `User.avatarUrl` na
 * mesma requisição — upload e "salvar no perfil" são o mesmo passo
 * aqui, não 2 chamadas separadas (upload + PATCH).
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limit = hitRateLimit(`avatar:${user.id}`, 10, 10 * 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSec);

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande (máximo ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)` },
      { status: 413 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const result = await processImageUpload(file, request, { kind: "avatars", maxDimension: MAX_DIMENSION });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: result.url } });

  return NextResponse.json({ avatarUrl: result.url }, { status: 201 });
}

/** Remove o avatar (volta pras iniciais) — sem isso, quem envia o
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
