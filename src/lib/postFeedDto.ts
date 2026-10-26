import { prisma } from "@/lib/prisma";
import { toPostDto, type PostDTO } from "@/lib/postDto";
import type { Post } from "@prisma/client";
import { blockedUserIdSet } from "@/lib/blocks";
import { equippedTitleNames } from "@/lib/quiz";

type Author = { id: string; displayName: string; handle: string | null; avatarUrl: string | null };
type QuotedPostRow = Post & { user: Author };

/**
 * Formato comum que toda rota de leitura de post (feed global, aba
 * Seguindo, perfil público) precisa consultar — extraído aqui pra não
 * duplicar a resolução de repost/citação em cada rota (a mesma classe de
 * "2 caminhos de leitura divergiram" que motivou outras funções
 * compartilhadas neste projeto, ex.: isValidHttpUrl, isBlank).
 */
export type PostRow = Post & {
  user: Author;
  quotedPost: QuotedPostRow | null;
  _count: { likes: number; comments: number };
  /** Obra sem AniList ID: para o link do post ir a /anime/anidb-<id>. */
  catalogEntry: { anidbId: number | null; kitsuId: number | null } | null;
};

export const POST_ROW_INCLUDE = {
  user: { select: { id: true, displayName: true, handle: true, avatarUrl: true } },
  quotedPost: { include: { user: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } } },
  // PostComment tem soft delete (deletedAt) — contar a relação crua sem
  // filtro incluía comentários apagados no contador exibido no card
  // (achado real de verificação ao vivo: um comentário apagado
  // continuava contando depois de recarregar a página).
  _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
  // Obra sem AniList ID: o link do post leva a /anime/anidb-<id>.
  catalogEntry: { select: { anidbId: true, kitsuId: true } },
} as const;

/**
 * Uma linha-repost (Epic 25 — `repostOfId` setado) não tem corpo/imagem/
 * curtida/comentário próprios — aparece na posição de QUANDO foi
 * repostada (a query já ordena/pagina pela `createdAt` da própria
 * linha), mas o conteúdo exibido é sempre o do ORIGINAL. Resolve todos
 * os originais referenciados numa única consulta extra (evita N+1).
 */
async function resolveRepostRows(
  page: PostRow[]
): Promise<{ effective: PostRow; repostedBy: Author | null }[]> {
  const originalIds = [...new Set(page.filter((p) => p.repostOfId).map((p) => p.repostOfId as string))];
  const originals = originalIds.length
    ? await prisma.post.findMany({ where: { id: { in: originalIds } }, include: POST_ROW_INCLUDE })
    : [];
  const originalById = new Map(originals.map((o) => [o.id, o]));

  return page
    .map((row) => {
      if (!row.repostOfId) return { effective: row, repostedBy: null };
      const original = originalById.get(row.repostOfId);
      // Original apagado de verdade (nunca acontece hoje — Post só tem
      // soft delete — mas defensivo) ou soft-deletado depois de
      // repostado: nada pra mostrar nessa posição do feed.
      if (!original || original.deletedAt) return null;
      return {
        effective: original,
        repostedBy: { id: row.user.id, displayName: row.user.displayName, handle: row.user.handle, avatarUrl: row.user.avatarUrl },
      };
    })
    .filter((r): r is { effective: PostRow; repostedBy: Author | null } => r !== null);
}

/**
 * Carrega em lote (não um fetch por post) o estado de curtida/denúncia/
 * repost do viewer pra essa página — mesma lógica de evitar N+1 usada em
 * myOpenReports na rota de comentários.
 */
export async function toDtoPage(page: PostRow[], viewerId: string | null): Promise<PostDTO[]> {
  // Bloqueio (D-10): nada de quem bloqueei ou de quem me bloqueou — nem o
  // autor, nem quem repostou, nem o post citado. A página pode vir com
  // menos itens que o limite; isso é esperado e o cursor segue válido.
  const blocked = await blockedUserIdSet(viewerId);
  const resolved = (await resolveRepostRows(page)).filter(
    (r) => !blocked.has(r.effective.user.id) && !(r.repostedBy && blocked.has(r.repostedBy.id))
  );
  const postIds = resolved.map((r) => r.effective.id);
  // Leitura pública (viewer deslogado) não tem "minhas curtidas"/"minhas
  // denúncias"/"meus reposts" — pula as consultas em vez de rodar com
  // userId nulo.
  const postAnilistIds = [...new Set(resolved.map((r) => r.effective.anilistId).filter((id): id is number => id !== null))];
  const [myLikes, myOpenReports, myReposts, myFavorites] = viewerId
    ? await Promise.all([
        prisma.postLike.findMany({
          where: { userId: viewerId, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.postReport.findMany({
          where: { reporterId: viewerId, resolvedAt: null, postId: { in: postIds } },
          select: { postId: true },
        }),
        prisma.post.findMany({
          where: { userId: viewerId, repostOfId: { in: postIds } },
          select: { repostOfId: true },
        }),
        prisma.anime.findMany({
          where: { userId: viewerId, anilistId: { in: postAnilistIds }, isFavorite: true },
          select: { anilistId: true },
        }),
      ])
    : [[], [], [], []];
  // Título original e formato vêm da produção canônica (Figma mostra "葬送のフリーレン · TV").
  const productions = postAnilistIds.length
    ? await prisma.production.findMany({
        where: { anilistId: { in: postAnilistIds } },
        select: { anilistId: true, titleNative: true, format: true },
      })
    : [];
  const productionById = new Map(productions.map((p) => [p.anilistId, p]));
  const authorTitles = await equippedTitleNames(resolved.map((r) => r.effective.user.id));
  const likedSet = new Set(myLikes.map((l) => l.postId));
  const reportedSet = new Set(myOpenReports.map((r) => r.postId));
  const repostedSet = new Set(myReposts.map((r) => r.repostOfId));
  const favoritedAnilistIdSet = new Set(myFavorites.map((a) => a.anilistId));

  return resolved.map(({ effective, repostedBy }) =>
    toPostDto(effective, {
      viewerId,
      likeCount: effective._count.likes,
      likedByMe: likedSet.has(effective.id),
      reportedByMe: reportedSet.has(effective.id),
      commentCount: effective._count.comments,
      quotedPost: effective.quotedPost && blocked.has(effective.quotedPost.user.id) ? null : effective.quotedPost,
      repostedBy,
      repostedByMe: repostedSet.has(effective.id),
      favoritedByMe: effective.anilistId !== null && favoritedAnilistIdSet.has(effective.anilistId),
      production: effective.anilistId !== null ? (productionById.get(effective.anilistId) ?? null) : null,
      authorTitle: authorTitles.get(effective.user.id) ?? null,
    })
  );
}
