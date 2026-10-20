import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CURATION_VERSION } from "@/lib/curation/curateEntry";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const FILTERS = ["all", "curated", "todo", "issues"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Admin → Curadoria: a lista de TODAS as obras da plataforma com o estado de cada uma (curada ou não, tipo, gêneros e as
 * pendências em aberto). `?filter=all|curated|todo|issues`, `?q=` (parte do título) e `?page=`.
 */
export async function GET(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const url = new URL(request.url);
  const filterParam = url.searchParams.get("filter") ?? "all";
  if (!(FILTERS as readonly string[]).includes(filterParam)) return NextResponse.json({ error: "filter inválido" }, { status: 400 });
  const filter = filterParam as Filter;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(0, Number(url.searchParams.get("page")) || 0);

  const where: Prisma.CatalogEntryWhereInput = { onPlatform: true };
  if (q) where.OR = [{ titleRomaji: { contains: q, mode: "insensitive" } }, { titleEnglish: { contains: q, mode: "insensitive" } }, { titleNative: { contains: q } }];
  if (filter === "curated") where.curationVersion = { gte: CURATION_VERSION };
  if (filter === "todo") where.curationVersion = { lt: CURATION_VERSION };
  if (filter === "issues") {
    const withIssues = await prisma.curationIssue.findMany({ where: { status: "OPEN" }, distinct: ["entryId"], select: { entryId: true } });
    where.id = { in: withIssues.map((i) => i.entryId) };
  }

  const [total, rows] = await Promise.all([
    prisma.catalogEntry.count({ where }),
    prisma.catalogEntry.findMany({
      where,
      orderBy: filter === "curated" ? [{ curatedAt: "desc" }, { id: "asc" }] : [{ titleRomaji: "asc" }, { id: "asc" }],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, anilistId: true, anidbId: true, titleRomaji: true, kind: true, genres: true, siteScore: true, curationVersion: true, curatedAt: true },
    }),
  ]);
  const issues = rows.length ? await prisma.curationIssue.findMany({ where: { entryId: { in: rows.map((r) => r.id) }, status: "OPEN" }, select: { entryId: true, code: true } }) : [];
  const byEntry = new Map<string, string[]>();
  for (const issue of issues) byEntry.set(issue.entryId, [...(byEntry.get(issue.entryId) ?? []), issue.code]);

  return NextResponse.json(
    {
      total,
      page,
      pageSize: PAGE_SIZE,
      items: rows.map((r) => ({
        id: r.id,
        anilistId: r.anilistId,
        anidbId: r.anidbId,
        title: r.titleRomaji,
        kind: r.kind,
        genres: r.genres ? r.genres.split(",").filter(Boolean) : [],
        siteScore: r.siteScore,
        curated: r.curationVersion >= CURATION_VERSION,
        issues: byEntry.get(r.id) ?? [],
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
