import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isBlank } from "@/lib/text";

type Params = { params: Promise<{ id: string }> };

const MAX_BODY_LENGTH = 2000;
const PAGE_SIZE = 10;

/**
 * Comentários (Epic 15) são chaveados por anilistId, não pelo id da linha de
 * Anime do usuário (cada usuário tem sua própria linha por anime) — então
 * quem comenta/lê precisa ter esse mesmo anime na própria lista, e o que
 * aparece é o mesmo pra todo mundo que também tem. `[id]` continua sendo a
 * linha de Anime de quem está fazendo a requisição, só pra achar o
 * anilistId e confirmar posse — igual todo outro sub-recurso de anime.
 */
async function loadOwnedAnime(id: string, userId: string) {
  const anime = await prisma.anime.findUnique({
    where: { id },
    select: { anilistId: true, userId: true },
  });
  if (!anime || anime.userId !== userId) return null;
  return anime;
}

export async function GET(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await loadOwnedAnime(id, user.id);
  if (!anime) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  const url = new URL(request.url);
  const requestedPage = Number(url.searchParams.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const totalCount = await prisma.comment.count({
    where: { anilistId: anime.anilistId, deletedAt: null },
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const comments = await prisma.comment.findMany({
    where: { anilistId: anime.anilistId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { user: { select: { id: true, displayName: true } } },
  });

  // Denúncia própria ainda em aberto (não resolvida) — vira o estado
  // "Denunciado" no cliente. Consultado do servidor, não guardado só em
  // estado local, pra não ficar desatualizado quando a denúncia anterior já
  // foi resolvida (nesse caso a pessoa pode denunciar de novo).
  const myOpenReports = await prisma.commentReport.findMany({
    where: { reporterId: user.id, resolvedAt: null, commentId: { in: comments.map((c) => c.id) } },
    select: { commentId: true },
  });
  const reportedByMe = new Set(myOpenReports.map((r) => r.commentId));

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: {
        id: c.user.id,
        displayName: c.user.displayName,
      },
      isMine: c.user.id === user.id,
      reportedByMe: reportedByMe.has(c.id),
    })),
    page,
    totalPages,
    totalCount,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await loadOwnedAnime(id, user.id);
  if (!anime) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  // isBlank (não só !text) — ver src/lib/text.ts: um comentário só de
  // zero-width space passava por .trim() como "não vazio" (achado real da
  // 11ª rodada de auditoria, Epic 18, originalmente visto no título em PT).
  if (isBlank(text)) {
    return NextResponse.json({ error: "Comentário não pode ser vazio" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Comentário muito longo (máximo ${MAX_BODY_LENGTH} caracteres)` },
      { status: 400 }
    );
  }

  const comment = await prisma.comment.create({
    data: { anilistId: anime.anilistId, userId: user.id, body: text },
    include: { user: { select: { id: true, displayName: true } } },
  });

  const totalCount = await prisma.comment.count({
    where: { anilistId: anime.anilistId, deletedAt: null },
  });

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.user.id,
          displayName: comment.user.displayName,
        },
        isMine: true,
        reportedByMe: false,
      },
      totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    },
    { status: 201 }
  );
}
