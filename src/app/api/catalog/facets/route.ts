import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { KINDS } from "@/lib/curation/kind";

export const dynamic = "force-dynamic";

const SEASON_ORDER = ["WINTER", "SPRING", "SUMMER", "FALL"];

/**
 * O que existe no catálogo para montar os filtros do Explorar sem baixar as obras: gêneros (com quantas obras cada um tem;
 * só os de 2+ obras), status, temporadas, anos e tipos. Nada de opção vazia.
 */
export async function GET() {
  const base = { onPlatform: true, ...NOT_BLOCKED_GENRE };
  const [genreRows, statusRows, seasonRows, kindRows, yearRows, total] = await Promise.all([
    prisma.catalogEntry.findMany({ where: { ...base, genres: { not: null } }, select: { genres: true } }),
    prisma.catalogEntry.groupBy({ by: ["status"], where: base }),
    prisma.catalogEntry.groupBy({ by: ["season"], where: base }),
    prisma.catalogEntry.groupBy({ by: ["kind"], where: base }),
    prisma.$queryRaw<Array<{ y: number }>>`SELECT DISTINCT EXTRACT(YEAR FROM "startDate")::int AS y FROM "CatalogEntry" WHERE "onPlatform" = true AND "startDate" IS NOT NULL ORDER BY y DESC`,
    prisma.catalogEntry.count({ where: base }),
  ]);

  const counts = new Map<string, number>();
  for (const row of genreRows) for (const genre of (row.genres ?? "").split(",")) if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  const genres = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json(
    {
      total,
      genres,
      statuses: statusRows.map((r) => r.status).filter((s): s is string => Boolean(s)),
      seasons: SEASON_ORDER.filter((s) => seasonRows.some((r) => r.season === s)),
      years: yearRows.map((r) => r.y),
      kinds: KINDS.filter((k) => kindRows.some((r) => r.kind === k)),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
