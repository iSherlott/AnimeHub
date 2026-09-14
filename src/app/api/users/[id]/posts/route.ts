import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { toPostDto } from "@/lib/postDto";

type Params = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Posts de um autor específico (perfil público) — mesma paginação por
 * cursor da aba "Seguindo" do feed, só que filtrada por um único userId
 * em vez de uma lista de quem o viewer segue. Leitura não exige sessão.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT)
  );

  const rows = await prisma.post.findMany({
    where: { userId: id, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, displayName: true } },
      _count: { select: { likes: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const viewer = await getCurrentUser();
  const postIds = page.map((p) => p.id);
  const [myLikes, myOpenReports] = viewer
    ? await Promise.all([
        prisma.postLike.findMany({
          where: { userId: viewer.id, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.postReport.findMany({
          where: { reporterId: viewer.id, resolvedAt: null, postId: { in: postIds } },
          select: { postId: true },
        }),
      ])
    : [[], []];
  const likedSet = new Set(myLikes.map((l) => l.postId));
  const reportedSet = new Set(myOpenReports.map((r) => r.postId));

  return NextResponse.json({
    posts: page.map((post) =>
      toPostDto(post, {
        viewerId: viewer?.id ?? null,
        likeCount: post._count.likes,
        likedByMe: likedSet.has(post.id),
        reportedByMe: reportedSet.has(post.id),
      })
    ),
    nextCursor,
  });
}
