import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { toDtoPage, POST_ROW_INCLUDE } from "@/lib/postFeedDto";
import { blockRelation } from "@/lib/blocks";

type Params = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Posts de um autor específico (perfil público) — mesma paginação por
 * cursor da aba "Seguindo" do feed, só que filtrada por um único userId
 * em vez de uma lista de quem o viewer segue. Leitura não exige sessão.
 * Inclui as linhas-repost dessa pessoa (Epic 25) — resolvidas pro
 * original com a mesma atribuição "X repostou" do feed global.
 */
export async function GET(request: Request, { params }: Params) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT)
  );

  const viewer = await getCurrentUser();
  if ((await blockRelation(viewer?.id ?? null, id)) !== "none") {
    return NextResponse.json({ error: "Perfil indisponível" }, { status: 404 });
  }

  const rows = await prisma.post.findMany({
    // "Discussões iniciadas" (PROF-004, proposta): publicações da pessoa que
    // abrem conversa sobre uma obra (contexto explícito). Reposts ficam fora.
    where: {
      userId: id,
      deletedAt: null,
      ...(searchParams.get("kind") === "discussions" ? { anilistId: { not: null }, repostOfId: null } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: POST_ROW_INCLUDE,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({
    posts: await toDtoPage(page, viewer?.id ?? null),
    nextCursor,
  });
}
