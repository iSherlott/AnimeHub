import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { toPostDto, type PostDTO } from "@/lib/postDto";
import { computeRecommendedScore, RANKED_WINDOW_SIZE } from "@/lib/feedRanking";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type PostWithCount = Awaited<ReturnType<typeof loadFollowingPage>>["page"][number];

/**
 * Carrega em lote (não um fetch por post) o estado de curtida/denúncia do
 * viewer pra essa página — mesma lógica de evitar N+1 usada em
 * myOpenReports na rota de comentários.
 */
async function toDtoPage(page: PostWithCount[], viewerId: string): Promise<PostDTO[]> {
  const postIds = page.map((p) => p.id);
  const [myLikes, myOpenReports] = await Promise.all([
    prisma.postLike.findMany({
      where: { userId: viewerId, postId: { in: postIds } },
      select: { postId: true },
    }),
    prisma.postReport.findMany({
      where: { reporterId: viewerId, resolvedAt: null, postId: { in: postIds } },
      select: { postId: true },
    }),
  ]);
  const likedSet = new Set(myLikes.map((l) => l.postId));
  const reportedSet = new Set(myOpenReports.map((r) => r.postId));

  return page.map((post) =>
    toPostDto(post, {
      viewerId,
      likeCount: post._count.likes,
      likedByMe: likedSet.has(post.id),
      reportedByMe: reportedSet.has(post.id),
    })
  );
}

async function loadFollowingPage(userId: string, cursor: string | null, limit: number) {
  const followed = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = followed.map((f) => f.followingId);

  if (followingIds.length === 0) {
    return { page: [], nextCursor: null as string | null };
  }

  const rows = await prisma.post.findMany({
    where: { userId: { in: followingIds }, deletedAt: null },
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
  return { page, nextCursor };
}

async function loadRecommendedPage(offset: number, limit: number) {
  const window = await prisma.post.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: RANKED_WINDOW_SIZE,
    include: {
      user: { select: { id: true, displayName: true } },
      _count: { select: { likes: true } },
    },
  });

  const now = new Date();
  const ranked = [...window].sort((a, b) => {
    const scoreDiff =
      computeRecommendedScore(b._count.likes, b.createdAt, now) -
      computeRecommendedScore(a._count.likes, a.createdAt, now);
    if (scoreDiff !== 0) return scoreDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const page = ranked.slice(offset, offset + limit);
  const nextOffset = offset + limit < ranked.length ? offset + limit : null;
  return { page, nextOffset };
}

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") === "following" ? "following" : "recommended";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));

  if (tab === "following") {
    const cursor = searchParams.get("cursor");
    const { page, nextCursor } = await loadFollowingPage(user.id, cursor, limit);
    return NextResponse.json({ posts: await toDtoPage(page, user.id), nextCursor });
  }

  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const { page, nextOffset } = await loadRecommendedPage(offset, limit);
  return NextResponse.json({ posts: await toDtoPage(page, user.id), nextOffset });
}
