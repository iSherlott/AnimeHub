import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { toPostDto, type PostDTO } from "@/lib/postDto";
import { computeRecommendedScore, RANKED_WINDOW_SIZE } from "@/lib/feedRanking";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type PostWithCount = Awaited<ReturnType<typeof loadFollowingPage>>["page"][number];

/**
 * Carrega em lote (não um fetch por post) o estado de curtida/denúncia do
 * viewer pra essa página — mesma lógica de evitar N+1 usada em
 * myOpenReports na rota de comentários.
 */
async function toDtoPage(page: PostWithCount[], viewerId: string | null): Promise<PostDTO[]> {
  const postIds = page.map((p) => p.id);
  // Leitura pública (viewer deslogado) não tem "minhas curtidas"/"minhas
  // denúncias" — pula as 2 consultas em vez de rodar com userId nulo.
  const [myLikes, myOpenReports] = viewerId
    ? await Promise.all([
        prisma.postLike.findMany({
          where: { userId: viewerId, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.postReport.findMany({
          where: { reporterId: viewerId, resolvedAt: null, postId: { in: postIds } },
          select: { postId: true },
        }),
      ])
    : [[], []];
  const likedSet = new Set(myLikes.map((l) => l.postId));
  const reportedSet = new Set(myOpenReports.map((r) => r.postId));

  return page.map((post) =>
    toPostDto(post, {
      viewerId,
      likeCount: post._count.likes,
      likedByMe: likedSet.has(post.id),
      reportedByMe: reportedSet.has(post.id),
      commentCount: post._count.comments,
    })
  );
}

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
    include: {
      user: { select: { id: true, displayName: true } },
      // PostComment tem soft delete (deletedAt) — contar a relação crua
      // sem filtro incluía comentários apagados no contador exibido no
      // card (achado real de verificação ao vivo: um comentário apagado
      // continuava contando depois de recarregar a página).
      _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
    },
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
    include: {
      user: { select: { id: true, displayName: true } },
      // PostComment tem soft delete (deletedAt) — contar a relação crua
      // sem filtro incluía comentários apagados no contador exibido no
      // card (achado real de verificação ao vivo: um comentário apagado
      // continuava contando depois de recarregar a página).
      _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
    },
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
