import { prisma } from "@/lib/prisma";
import { POST_ROW_INCLUDE } from "@/lib/postFeedDto";
import { computeRecommendedScore, RANKED_WINDOW_SIZE } from "@/lib/feedRanking";

/**
 * Movido de src/app/api/posts/route.ts (Epic 26) — movimento puro, sem
 * mudar lógica — pra dar pra reaproveitar a mesma janela/pontuação/
 * desempate já endurecidos nas rodadas 15-16 do Epic 18 também na seção
 * "Posts em alta" da lateral do Feed
 * (src/app/api/feed/trending-posts/route.ts), sem duplicar essa lógica.
 */
export async function loadRecommendedPage(offset: number, limit: number, now: Date) {
  const window = await prisma.post.findMany({
    // `createdAt: { lte: now }` tranca o CONJUNTO de posts elegíveis pro
    // mesmo instante fixado por `now`/`since` (ver comentário no GET de
    // src/app/api/posts/route.ts) contra INSERÇÃO — sem isso, um post novo
    // chegando no meio de uma rolagem empurra o índice de todo post mais
    // antigo adiante, e uma página seguinte (ainda pedindo o mesmo offset
    // de antes) repete um post que uma página anterior já tinha mostrado
    // (achado real da 16ª rodada de auditoria, Epic 18). A condição de
    // `deletedAt` faz o mesmo travamento contra REMOÇÃO — o espelho exato
    // do mesmo bug, achado na revisão de código desta mesma correção: sem
    // fixar contra `now` também aqui, apagar um post (pelo autor, ou por
    // um admin resolvendo denúncia) no meio da mesma sessão de rolagem
    // encolhe a janela resultante por trás do offset já usado, e a página
    // seguinte pula um post que nunca chegou a aparecer em nenhuma
    // página. `deletedAt: null OR deletedAt > now` mantém elegível um
    // post que só foi apagado DEPOIS do instante travado desta sessão.
    where: {
      createdAt: { lte: now },
      OR: [{ deletedAt: null }, { deletedAt: { gt: now } }],
    },
    // Tiebreaker por `id` — mesmo padrão de `loadFollowingPage` (mesmo
    // arquivo original). Sem isso, 2 posts com `createdAt` no mesmo
    // milissegundo (plausível em fixtures/seeds em lote) não têm ordem
    // garantida entre uma consulta e a próxima, reabrindo a mesma classe
    // de instabilidade que `since` existe pra fechar — só que pelo
    // empate, não pela janela em si.
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
