import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { annotateOwnership, discoverItemFromCatalogEntry } from "@/lib/discoverItem";
import { catalogOrderBy, catalogWhere, matchesTitleQuery, parseCatalogParams } from "@/lib/catalogPage";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Uma página do catálogo da plataforma para o Explorar (rolagem infinita). Os filtros (`genre`, `status`, `season`, `year`,
 * `kind`, `availability`), a busca por título (`q`, também por outra grafia do nome) e a ordenação (`sort`) rodam aqui; a
 * tela só pede `cursor` (a posição) e `limit`. Devolve `{ items, nextCursor, total }`; a sinopse não vai na lista (os
 * cartões não a usam), então a página pesa uma fração do catálogo inteiro.
 */
export async function GET(request: Request) {
  const limited = rateLimitedResponse(`catalog-page:${clientIp(request)}`, 300, 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  const params = parseCatalogParams(new URL(request.url).searchParams);

  let searchIds: string[] | null = null;
  if ([...params.q].length >= 2) {
    const titles = await prisma.catalogEntry.findMany({ where: { onPlatform: true }, select: { id: true, titleRomaji: true, titleEnglish: true, titleNative: true } });
    searchIds = titles.filter((t) => matchesTitleQuery([t.titleRomaji, t.titleEnglish, t.titleNative], params.q)).map((t) => t.id);
  }

  const where = catalogWhere(params, searchIds);
  const [total, rows] = await Promise.all([
    prisma.catalogEntry.count({ where }),
    prisma.catalogEntry.findMany({ where, orderBy: catalogOrderBy(params.sort), skip: params.offset, take: params.limit }),
  ]);
  const items = await annotateOwnership(
    rows.map((row) => ({ ...discoverItemFromCatalogEntry(row), description: null })),
    user?.id ?? null
  );
  const next = params.offset + rows.length;
  return NextResponse.json({ items, nextCursor: next < total ? String(next) : null, total }, { headers: { "Cache-Control": "no-store" } });
}
