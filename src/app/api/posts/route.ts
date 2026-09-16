import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { toDtoPage, POST_ROW_INCLUDE } from "@/lib/postFeedDto";
import { computeRecommendedScore, RANKED_WINDOW_SIZE } from "@/lib/feedRanking";

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

async function loadRecommendedPage(offset: number, limit: number, now: Date) {
  const window = await prisma.post.findMany({
    // `createdAt: { lte: now }` tranca o CONJUNTO de posts elegíveis pro
    // mesmo instante fixado por `now`/`since` (ver comentário no GET
    // abaixo) contra INSERÇÃO — sem isso, um post novo chegando no meio de
    // uma rolagem empurra o índice de todo post mais antigo adiante, e uma
    // página seguinte (ainda pedindo o mesmo offset de antes) repete um
    // post que uma página anterior já tinha mostrado (achado real da 16ª
    // rodada de auditoria, Epic 18). A condição de `deletedAt` faz o mesmo
    // travamento contra REMOÇÃO — o espelho exato do mesmo bug, achado na
    // revisão de código desta mesma correção: sem fixar contra `now`
    // também aqui, apagar um post (pelo autor, ou por um admin resolvendo
    // denúncia) no meio da mesma sessão de rolagem encolhe a janela
    // resultante por trás do offset já usado, e a página seguinte pula um
    // post que nunca chegou a aparecer em nenhuma página. `deletedAt: null
    // OR deletedAt > now` mantém elegível um post que só foi apagado DEPOIS
    // do instante travado desta sessão.
    where: {
      createdAt: { lte: now },
      OR: [{ deletedAt: null }, { deletedAt: { gt: now } }],
    },
    // Tiebreaker por `id` — mesmo padrão de `loadFollowingPage` acima.
    // Sem isso, 2 posts com `createdAt` no mesmo milissegundo (plausível em
    // fixtures/seeds em lote) não têm ordem garantida entre uma consulta e
    // a próxima, reabrindo a mesma classe de instabilidade que `since`
    // existe pra fechar — só que pelo empate, não pela janela em si.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RANKED_WINDOW_SIZE,
    include: POST_ROW_INCLUDE,
  });

  const ranked = [...window].sort((a, b) => {
    const scoreDiff =
      computeRecommendedScore(b._count.likes, b.createdAt, now) -
      computeRecommendedScore(a._count.likes, a.createdAt, now);
    if (scoreDiff !== 0) return scoreDiff;
    const createdAtDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    // Mesmo empate de pontuação E de createdAt (plausível em fixtures/
    // seeds em lote) — desempate final por `id`, pra ordem ficar
    // determinística entre uma requisição e a próxima da mesma sessão.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const page = ranked.slice(offset, offset + limit);
  const nextOffset = offset + limit < ranked.length ? offset + limit : null;
  return { page, nextOffset };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") === "following" ? "following" : "recommended";
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
