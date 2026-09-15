import type { Post } from "@prisma/client";

export type PostDTO = {
  id: string;
  body: string;
  imageUrl: string | null;
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
};

type PostWithAuthor = Post & { user: { id: string; displayName: string } };

/**
 * Curtidas/denúncias não são colunas no Post — são contadas/consultadas à
 * parte (em lote, pra evitar N+1) por quem chama isto. `viewerId` é
 * opcional porque leituras públicas (perfil de outro usuário) não exigem
 * sessão — nesse caso isMine/likedByMe/reportedByMe vêm sempre false.
 */
export function toPostDto(
  post: PostWithAuthor,
  opts: {
    viewerId: string | null;
    likeCount: number;
    likedByMe: boolean;
    reportedByMe: boolean;
    commentCount: number;
  }
): PostDTO {
  return {
    id: post.id,
    body: post.body,
    imageUrl: post.imageUrl,
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
  };
}
