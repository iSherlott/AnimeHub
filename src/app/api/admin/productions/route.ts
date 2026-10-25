import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { CATALOG_CANDIDATE_PREFIX } from "@/lib/adminImport/pipeline";

/** Busca de produções para "Outro candidato" no Matching: por título ou AniList id. */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const asId = /^\d+$/.test(q) && q.length <= 9 ? Number(q) : null;

  const rows = await prisma.production.findMany({
    where: {
      OR: [
        { titleRomaji: { contains: q, mode: "insensitive" } },
        { titleEnglish: { contains: q, mode: "insensitive" } },
        { titleNative: { contains: q, mode: "insensitive" } },
        ...(asId !== null ? [{ anilistId: asId }] : []),
      ],
    },
    orderBy: [{ titleRomaji: "asc" }],
    take: 10,
    select: { id: true, anilistId: true, titleRomaji: true, titleNative: true, seasonNumber: true, format: true, franchise: { select: { name: true } } },
  });
  const results = rows.map((r) => ({
    id: r.id,
    anilistId: r.anilistId,
    titleRomaji: r.titleRomaji,
    titleNative: r.titleNative,
    seasonNumber: r.seasonNumber as number | null,
    format: r.format,
    franchise: r.franchise.name as string | null,
  }));

  // Obras que só estão no catálogo da temporada (ainda sem página própria) também podem ser o candidato.
  if (results.length < 10) {
    const entries = await prisma.catalogEntry.findMany({
      where: {
        anilistId: { not: null, notIn: rows.map((r) => r.anilistId) },
        OR: [
          { titleRomaji: { contains: q, mode: "insensitive" } },
          { titleEnglish: { contains: q, mode: "insensitive" } },
          { titleNative: { contains: q, mode: "insensitive" } },
          ...(asId !== null ? [{ anilistId: asId }] : []),
        ],
      },
      orderBy: [{ titleRomaji: "asc" }],
      take: 10 - results.length,
      select: { anilistId: true, titleRomaji: true, titleNative: true },
    });
    for (const e of entries) {
      if (e.anilistId === null) continue;
      results.push({ id: `${CATALOG_CANDIDATE_PREFIX}${e.anilistId}`, anilistId: e.anilistId, titleRomaji: e.titleRomaji, titleNative: e.titleNative, seasonNumber: null, format: null, franchise: null });
    }
  }
  return NextResponse.json({ results });
}
