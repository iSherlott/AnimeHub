import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

/** Fila de denúncias de PERFIS, agrupada por perfil denunciado. */
export async function GET() {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;

  const reports = await prisma.userReport.findMany({
    where: { resolvedAt: null },
    include: {
      target: { select: { id: true, displayName: true, email: true, bio: true } },
      reporter: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byTarget = new Map<
    string,
    {
      userId: string;
      displayName: string;
      email: string;
      bio: string | null;
      reasons: string[];
      reporters: { displayName: string; email: string }[];
    }
  >();
  for (const r of reports) {
    const existing = byTarget.get(r.targetUserId);
    if (existing) {
      existing.reporters.push(r.reporter);
      existing.reasons.push(r.reason);
      continue;
    }
    byTarget.set(r.targetUserId, {
      userId: r.target.id,
      displayName: r.target.displayName,
      email: r.target.email,
      bio: r.target.bio,
      reasons: [r.reason],
      reporters: [r.reporter],
    });
  }

  return NextResponse.json({
    reports: [...byTarget.values()].map((g) => ({ ...g, reportCount: g.reporters.length })),
  });
}
