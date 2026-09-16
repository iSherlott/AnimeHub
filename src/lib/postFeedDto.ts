import { prisma } from "@/lib/prisma";
import { toPostDto, type PostDTO } from "@/lib/postDto";
import type { Post } from "@prisma/client";

type Author = { id: string; displayName: string };
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
};

export const POST_ROW_INCLUDE = {
  user: { select: { id: true, displayName: true } },
  quotedPost: { include: { user: { select: { id: true, displayName: true } } } },
  // PostComment tem soft delete (deletedAt) — contar a relação crua sem
  // filtro incluía comentários apagados no contador exibido no card
  // (achado real de verificação ao vivo: um comentário apagado
  // continuava contando depois de recarregar a página).
  _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
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
      return { effective: original, repostedBy: { id: row.user.id, displayName: row.user.displayName } };
    })
    .filter((r): r is { effective: PostRow; repostedBy: Author | null } => r !== null);
}

/**
 * Carrega em lote (não um fetch por post) o estado de curtida/denúncia/
 * repost do viewer pra essa página — mesma lógica de evitar N+1 usada em
 * myOpenReports na rota de comentários.
 */
export async function toDtoPage(page: PostRow[], viewerId: string | null): Promise<PostDTO[]> {
  const resolved = await resolveRepostRows(page);
  const postIds = resolved.map((r) => r.effective.id);
  // Leitura pública (viewer deslogado) não tem "minhas curtidas"/"minhas
  // denúncias"/"meus reposts" — pula as consultas em vez de rodar com
  // userId nulo.
  const [myLikes, myOpenReports, myReposts] = viewerId
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
      ])
    : [[], [], []];
  const likedSet = new Set(myLikes.map((l) => l.postId));
  const reportedSet = new Set(myOpenReports.map((r) => r.postId));
  const repostedSet = new Set(myReposts.map((r) => r.repostOfId));

  return resolved.map(({ effective, repostedBy }) =>
    toPostDto(effective, {
      viewerId,
      likeCount: effective._count.likes,
      likedByMe: likedSet.has(effective.id),
      reportedByMe: reportedSet.has(effective.id),
      commentCount: effective._count.comments,
      quotedPost: effective.quotedPost,
      repostedBy,
      repostedByMe: repostedSet.has(effective.id),
    })
  );
}
