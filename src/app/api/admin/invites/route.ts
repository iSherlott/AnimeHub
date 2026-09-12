import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 dias

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    include: { usedBy: { select: { email: true, displayName: true } } },
  });
  return NextResponse.json({ invites });
}

export async function POST() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const code = randomBytes(12).toString("hex");
  const invite = await prisma.invite.create({
    data: {
      code,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  return NextResponse.json({ invite }, { status: 201 });
}
