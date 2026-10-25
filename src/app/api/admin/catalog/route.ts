import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

const PAGE_SIZE = 20;

/**
 * Admin → Catálogo (ADMIN-006): franquias com suas produções canônicas
 * (Franquia → Produção, D-18), busca por título/AniList id e contagem de
 * quem acompanha cada produção. Somente leitura: edição/overrides entram em
 * fatias seguintes (ADMIN-002/007).
 */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const asId = /^\d+$/.test(q) ? Number(q) : null;

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { productions: { some: { titleRomaji: { contains: q, mode: "insensitive" as const } } } },
          { productions: { some: { titleNative: { contains: q, mode: "insensitive" as const } } } },
          ...(asId !== null ? [{ rootAnilistId: asId }, { productions: { some: { anilistId: asId } } }] : []),
        ],
      }
    : {};

  const [total, franchises] = await Promise.all([
    prisma.franchise.count({ where }),
    prisma.franchise.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { productions: { orderBy: [{ seasonNumber: "asc" }, { anilistId: "asc" }] } },
    }),
  ]);

  const anilistIds = franchises.flatMap((f) => f.productions.map((p) => p.anilistId));
  const followers = anilistIds.length
    ? await prisma.anime.groupBy({
        by: ["anilistId"],
        where: { anilistId: { in: anilistIds }, userId: { not: null } },
        _count: { _all: true },
      })
    : [];
  const followersById = new Map(followers.map((f) => [f.anilistId, f._count._all]));

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    franchises: franchises.map((f) => ({
      id: f.id,
      name: f.name,
      rootAnilistId: f.rootAnilistId,
      productions: f.productions.map((p) => ({
        anilistId: p.anilistId,
        titleRomaji: p.titleRomaji,
        titleNative: p.titleNative,
        format: p.format,
        seasonNumber: p.seasonNumber,
        status: p.status,
        fetchedAt: p.fetchedAt.toISOString(),
        followers: followersById.get(p.anilistId) ?? 0,
      })),
    })),
  });
}
