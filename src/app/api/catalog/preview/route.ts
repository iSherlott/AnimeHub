import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { CATALOG_ONLY_SLUG } from "@/lib/workHref";

export const dynamic = "force-dynamic";

const genreList = (genres: string | null | undefined) => (genres ? genres.split(",").filter(Boolean) : []);

/**
 * O que a prévia de uma obra mostra além do que o cartão já tem: a sinopse (original e as traduções guardadas) e os
 * gêneros. As listas (Explorar paginado, Minha Lista, perfil, Feed) não carregam a sinopse; a prévia pede aqui só da
 * obra que a pessoa abriu. `work` é a chave do endereço da obra: o AniList ID ou `anidb-<id>`/`kitsu-<id>`. Pública.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimitedResponse(`catalog-preview:${clientIp(request)}`, 120, 60_000);
  if (limited) return limited;

  const key = request.nextUrl.searchParams.get("work")?.trim() ?? "";
  const select = { anilistId: true, description: true, descriptionPt: true, descriptionJa: true, genres: true } as const;

  if (/^\d{1,9}$/.test(key) && Number(key) > 0) {
    const anilistId = Number(key);
    const [catalog, production] = await Promise.all([
      prisma.catalogEntry.findUnique({ where: { anilistId }, select }),
      prisma.production.findUnique({ where: { anilistId }, select: { description: true, genres: true } }),
    ]);
    if (!catalog && !production) return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
    return NextResponse.json({
      anilistId,
      description: catalog?.description ?? production?.description ?? null,
      descriptionPt: catalog?.descriptionPt ?? null,
      descriptionJa: catalog?.descriptionJa ?? null,
      genres: genreList(catalog?.genres ?? production?.genres),
    });
  }

  const slug = CATALOG_ONLY_SLUG.exec(key);
  if (!slug || Number(slug[2]) <= 0) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  const sourceId = Number(slug[2]);
  const entry = await prisma.catalogEntry.findFirst({ where: { onPlatform: true, ...(slug[1] === "anidb" ? { anidbId: sourceId } : { kitsuId: sourceId }) }, select });
  if (!entry) return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  return NextResponse.json({ anilistId: entry.anilistId, description: entry.description, descriptionPt: entry.descriptionPt, descriptionJa: entry.descriptionJa, genres: genreList(entry.genres) });
}
