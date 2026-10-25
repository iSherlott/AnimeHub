import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

/** Fila de denúncias de RESPOSTAS, agrupada por comentário. */
export async function GET() {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;

  const reports = await prisma.postCommentReport.findMany({
    where: { resolvedAt: null },
    include: {
      comment: { include: { user: { select: { displayName: true, email: true } } } },
      reporter: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byComment = new Map<
    string,
    {
      commentId: string;
      postId: string;
      body: string;
      isSpoiler: boolean;
      commentCreatedAt: string;
      commentDeleted: boolean;
      author: { displayName: string; email: string };
      reasons: string[];
      reporters: { displayName: string; email: string }[];
    }
  >();
  for (const r of reports) {
    const existing = byComment.get(r.commentId);
    if (existing) {
      existing.reporters.push(r.reporter);
      existing.reasons.push(r.reason);
      continue;
    }
    byComment.set(r.commentId, {
      commentId: r.commentId,
      postId: r.comment.postId,
      body: r.comment.body,
      isSpoiler: r.comment.isSpoiler,
      commentCreatedAt: r.comment.createdAt.toISOString(),
      commentDeleted: Boolean(r.comment.deletedAt),
      author: r.comment.user,
      reasons: [r.reason],
      reporters: [r.reporter],
    });
  }

  return NextResponse.json({
    reports: [...byComment.values()].map((g) => ({ ...g, reportCount: g.reporters.length })),
  });
}
