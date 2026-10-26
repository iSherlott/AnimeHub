import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { toDtoPage, POST_ROW_INCLUDE } from "@/lib/postFeedDto";
import { loadRecommendedPage } from "@/lib/feedRecommended";
import { createPostResponse } from "@/lib/createPost";
import { ensureProduction } from "@/lib/production";
import { rateLimitedResponse } from "@/lib/rateLimit";
import { resolveWorkKey, type WorkRef } from "@/lib/workRef";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

async function loadFollowingPage(userId: string, cursor: string | null, limit: number) {
  const followed = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = followed.map((f) => f.followingId);

  if (followingIds.length === 0) {
    return { page: [], nextCursor: null as string | null };
  }

  const rows = await prisma.post.findMany({
    where: { userId: { in: followingIds }, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: POST_ROW_INCLUDE,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { page, nextCursor };
}

/**
 * "Recentes" (Figma `13:41143`): publicações públicas, da mais nova para a
 * mais antiga, com cursor. `anilistId` restringe às discussões de uma obra
 * (seção "Discussões" do detalhe público).
 */
async function loadRecentPage(cursor: string | null, limit: number, work: WorkRef | null) {
  const rows = await prisma.post.findMany({
    where: { deletedAt: null, ...(work ? (work.anilistId !== null ? { anilistId: work.anilistId } : { anilistId: null, catalogEntryId: work.catalogEntryId }) : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: POST_ROW_INCLUDE,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;
  return { page, nextCursor };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tabParam = searchParams.get("tab");
  const tab = tabParam === "following" ? "following" : tabParam === "recent" ? "recent" : "recommended";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));

  // "Seguindo" não existe sem conta — só essa aba exige login. "Recomendado"
  // é a leitura pública do feed (Instagram/Twitter deixam navegar sem
  // conta; só interagir exige login).
  if (tab === "following") {
    const { user, response } = await requireUser();
    if (!user) return response;
    const cursor = searchParams.get("cursor");
    const { page, nextCursor } = await loadFollowingPage(user.id, cursor, limit);
    return NextResponse.json({ posts: await toDtoPage(page, user.id), nextCursor });
  }

  if (tab === "recent") {
    const user = await getCurrentUser();
    // `anilistId` (obra da AniList) ou `work` (a chave da obra: AniList ID ou `anidb-<id>`/`kitsu-<id>`).
    const anilistParam = Number(searchParams.get("anilistId"));
    const workParam = searchParams.get("work");
    const work = workParam ? await resolveWorkKey(workParam) : Number.isInteger(anilistParam) && anilistParam > 0 ? ({ anilistId: anilistParam, catalogEntryId: null } as const) : null;
    // Obra pedida e não encontrada: nenhuma publicação (e não o feed inteiro).
    if (workParam && !work) return NextResponse.json({ posts: [], nextCursor: null });
    const { page, nextCursor } = await loadRecentPage(searchParams.get("cursor"), limit, work);
    return NextResponse.json({ posts: await toDtoPage(page, user?.id ?? null), nextCursor });
  }

  const user = await getCurrentUser();
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  // `since` fixa o instante usado tanto pra calcular a pontuação (gravidade)
  // quanto pra travar QUAIS posts entram na janela ranqueada (ver
  // `loadRecommendedPage`), durante toda uma sessão de rolagem — sem a
  // parte da pontuação, cada página recalculava a pontuação com
  // `new Date()` na hora da própria requisição, e como a taxa de
  // decaimento é diferente por idade de post, 2 posts perto da borda entre
  // páginas podiam trocar de ordem só pelo tempo passar entre 1 requisição
  // e a próxima (achado real da 15ª rodada de auditoria, Epic 18). Sem a
  // parte da janela travada, um post novo publicado no meio da rolagem
  // deslocava o índice de todo post mais antigo, fazendo a 2ª página (com
  // o mesmo `offset` de antes) repetir posts que a 1ª página já tinha
  // mostrado (achado real da 16ª rodada). O cliente manda de volta o
  // `since` da 1ª página em cada página seguinte; sem ele (1ª página, ou
  // uma chamada direta à API), cai pro comportamento de sempre.
  const sinceParam = searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  const now = since && !Number.isNaN(since.getTime()) ? since : new Date();
  const { page, nextOffset } = await loadRecommendedPage(offset, limit, now);
  return NextResponse.json({
    posts: await toDtoPage(page, user?.id ?? null),
    nextOffset,
    since: now.toISOString(),
  });
}

/**
 * Criar publicação (Figma `13:41840`): a obra é OPCIONAL e escolhida
 * explicitamente (`anilistId` — a produção); mencionar um nome ou hashtag
 * no texto nunca cria associação. Publicar não exige acompanhar a obra
 * (D-27) e não cria nenhum vínculo.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`post:${user.id}`, 30, 10 * 60_000);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  let anime = null;
  // Obra sem AniList ID (só do AniDB/Kitsu): `work` = "anidb-<id>" — o contexto é a obra do catálogo.
  if ((body.anilistId === undefined || body.anilistId === null) && typeof body.work === "string" && body.work.trim()) {
    const work = await resolveWorkKey(body.work);
    if (!work) return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
    if (work.anilistId === null) {
      return createPostResponse(user, body, { anilistId: null, catalogEntryId: work.catalogEntryId, titleRomaji: work.titleRomaji, titleEnglish: work.titleEnglish, coverImage: work.coverImage });
    }
    body.anilistId = work.anilistId;
  }
  if (body.anilistId !== undefined && body.anilistId !== null) {
    const anilistId = Number(body.anilistId);
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
    }
    const production = await ensureProduction(anilistId);
    if (!production) {
      return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
    }
    anime = {
      anilistId: production.anilistId,
      titleRomaji: production.titleRomaji,
      titleEnglish: production.titleEnglish,
      coverImage: production.coverImage,
    };
  }

  return createPostResponse(user, body, anime);
}
