import type { Post } from "@prisma/client";

/**
 * Pré-visualização só-leitura de um post citado (Epic 25) — nunca mais
 * de 1 nível (citar uma citação embute só a mais recente, mesmo limite
 * visual do Twitter). Sem link: este app não tem página de post avulso.
 */
export type PostSummaryDTO = {
  id: string;
  author: { id: string; displayName: string };
  body: string;
  imageUrl: string | null;
  animeTitleRomaji: string;
  animeTitleEnglish: string | null;
  createdAt: string;
};

export type PostDTO = {
  id: string;
  body: string;
  imageUrls: string[];
  createdAt: string;
  anilistId: number;
  animeTitleRomaji: string;
  animeTitleEnglish: string | null;
  animeCoverImage: string | null;
  author: { id: string; displayName: string };
  isMine: boolean;
  likeCount: number;
  likedByMe: boolean;
  reportedByMe: boolean;
  commentCount: number;
  quotedPost: PostSummaryDTO | null;
  /// Quem repostou (Epic 25) — presente só quando esta linha do feed
  /// veio de uma linha-repost resolvida pro original; o próprio PostDTO
  /// sempre descreve o ORIGINAL (curtida/comentário/citação agem sobre
  /// `id` acima, nunca sobre a linha de repost em si).
  repostedBy: { id: string; displayName: string } | null;
  repostedByMe: boolean;
};

type PostWithAuthor = Post & { user: { id: string; displayName: string } };

export function toPostSummaryDto(post: PostWithAuthor): PostSummaryDTO {
  return {
    id: post.id,
    author: { id: post.user.id, displayName: post.user.displayName },
    body: post.body,
    imageUrl: post.imageUrls[0] ?? null,
    animeTitleRomaji: post.animeTitleRomaji,
    animeTitleEnglish: post.animeTitleEnglish,
    createdAt: post.createdAt.toISOString(),
  };
}

/**
 * Curtidas/denúncias não são colunas no Post — são contadas/consultadas à
 * parte (em lote, pra evitar N+1) por quem chama isto. `viewerId` é
 * opcional porque leituras públicas (perfil de outro usuário) não exigem
 * sessão — nesse caso isMine/likedByMe/reportedByMe vêm sempre false.
 * `post` aqui é sempre o ORIGINAL — uma linha-repost resolve pro
 * original antes de chegar aqui (ver src/app/api/posts/route.ts).
 */
export function toPostDto(
  post: PostWithAuthor,
  opts: {
    viewerId: string | null;
    likeCount: number;
    likedByMe: boolean;
    reportedByMe: boolean;
    commentCount: number;
    quotedPost?: PostWithAuthor | null;
    repostedBy?: { id: string; displayName: string } | null;
    repostedByMe?: boolean;
  }
): PostDTO {
  return {
    id: post.id,
    body: post.body,
    imageUrls: post.imageUrls,
    createdAt: post.createdAt.toISOString(),
    anilistId: post.anilistId,
    animeTitleRomaji: post.animeTitleRomaji,
    animeTitleEnglish: post.animeTitleEnglish,
    animeCoverImage: post.animeCoverImage,
    author: { id: post.user.id, displayName: post.user.displayName },
    isMine: post.user.id === opts.viewerId,
    likeCount: opts.likeCount,
    likedByMe: opts.likedByMe,
    reportedByMe: opts.reportedByMe,
    commentCount: opts.commentCount,
    quotedPost: opts.quotedPost ? toPostSummaryDto(opts.quotedPost) : null,
    repostedBy: opts.repostedBy ?? null,
    repostedByMe: opts.repostedByMe ?? false,
  };
}
