import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

const SUGGESTION_COUNT = 5;

/**
 * Sugestões de quem seguir pra popular a aba "Seguindo" quando ainda está
 * vazia — sem página de diretório separada. Membros mais novos primeiro
 * (critério simples, comunidade pequena e fechada por convite).
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const followed = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });
  const excludeIds = [user.id, ...followed.map((f) => f.followingId)];

  const users = await prisma.user.findMany({
    where: { id: { notIn: excludeIds } },
    select: { id: true, displayName: true },
    orderBy: { createdAt: "desc" },
    take: SUGGESTION_COUNT,
  });

  return NextResponse.json({ users });
}
