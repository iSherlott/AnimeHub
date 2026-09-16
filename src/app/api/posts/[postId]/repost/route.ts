import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ postId: string }> };

/**
 * Repost (Epic 25) — mesmo padrão exato de .../like/route.ts
 * (upsert/deleteMany, idempotente nas 2 direções). A linha de repost em
 * si nunca é exposta ao cliente (o feed resolve pro ORIGINAL — ver
 * src/app/api/posts/route.ts) e não tem curtida/comentário/denúncia
 * próprios, então hard-delete ao desfazer é seguro (mesma classe de
 * PostLike, não a de Post/Comment com soft delete).
 */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId } = await params;
  const target = await prisma.post.findUnique({
    where: { id: postId },
    select: { deletedAt: true, repostOfId: true },
  });
  if (!target || target.deletedAt) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }
  // Repostar um repost/citação sempre aponta pro original de verdade —
  // nunca deixa uma cadeia de repost-de-repost se formar.
  const originalId = target.repostOfId ?? postId;

  const original = await prisma.post.findUnique({
    where: { id: originalId },
    select: {
      userId: true,
      deletedAt: true,
      anilistId: true,
      animeTitleRomaji: true,
      animeTitleEnglish: true,
      animeCoverImage: true,
    },
  });
  if (!original || original.deletedAt) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }
  if (original.userId === user.id) {
    return NextResponse.json({ error: "Você não pode repostar o próprio post" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  // Ver src/app/api/anime/[id]/favorite/route.ts — mesma correção pro
  // mesmo anti-padrão (achado real da 10ª rodada de auditoria, Epic 18).
  if (typeof body.reposted !== "boolean") {
    return NextResponse.json({ error: "reposted deve ser um booleano" }, { status: 400 });
  }

  if (body.reposted) {
    await prisma.post.upsert({
      where: { userId_repostOfId: { userId: user.id, repostOfId: originalId } },
      create: {
        userId: user.id,
        repostOfId: originalId,
        anilistId: original.anilistId,
        animeTitleRomaji: original.animeTitleRomaji,
        animeTitleEnglish: original.animeTitleEnglish,
        animeCoverImage: original.animeCoverImage,
        body: "",
        imageUrls: [],
      },
      update: {},
    });
  } else {
    await prisma.post.deleteMany({ where: { userId: user.id, repostOfId: originalId } });
  }

  return NextResponse.json({ reposted: body.reposted });
}
