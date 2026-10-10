import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { toDtoPage, POST_ROW_INCLUDE } from "@/lib/postFeedDto";
import { NEWSHUB_EMAIL } from "@/lib/newsHub";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Notícias da temporada = publicações do NewsHub, no MESMO formato do feed da
 * Comunidade (cartão, curtir, comentar, repostar…). Escopos: "all" (todas) e
 * "following" (obras da Minha Lista, exige sessão); `q` busca no texto, no
 * título da obra e nas # (inclui "#nomedaobra"). Paginação por cursor, para a
 * rolagem infinita. Leitura pública.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "following" ? "following" : "all";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));
  const cursor = searchParams.get("cursor");
  const q = (searchParams.get("q") ?? "").trim().replace(/^#/, "").slice(0, 80);

  const user = await getCurrentUser();
  if (scope === "following" && !user) {
    return NextResponse.json({ error: "Entre para ver as notícias do que você acompanha." }, { status: 401 });
  }

  const hub = await prisma.user.findUnique({ where: { email: NEWSHUB_EMAIL }, select: { id: true } });
  if (!hub) return NextResponse.json({ posts: [], nextCursor: null });

  const and: Prisma.PostWhereInput[] = [{ userId: hub.id, deletedAt: null }];
  if (scope === "following") {
    const mine = await prisma.anime.findMany({ where: { userId: user!.id }, select: { anilistId: true } });
    and.push({ anilistId: { in: mine.map((m) => m.anilistId) } });
  }
  if (q) {
    and.push({
      OR: [
        { body: { contains: q, mode: "insensitive" } },
        { animeTitleRomaji: { contains: q, mode: "insensitive" } },
        { animeTitleEnglish: { contains: q, mode: "insensitive" } },
        { hashtags: { some: { hashtag: { key: { contains: q.toLowerCase() } } } } },
      ],
    });
  }

  const rows = await prisma.post.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: POST_ROW_INCLUDE,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({ posts: await toDtoPage(page, user?.id ?? null), nextCursor: hasMore ? page[page.length - 1].id : null });
}
