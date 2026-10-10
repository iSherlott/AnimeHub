"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Box } from "@mui/material";
import { PostCard } from "@/components/PostCard";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { quoteHref } from "@/lib/publishLinks";
import type { PostDTO } from "@/lib/postDto";

/**
 * Lista de publicações do feed — a MESMA para a Comunidade e para as
 * Notícias (que são publicações do NewsHub): cartão, curtir, comentar,
 * repostar, citar e denunciar se comportam igual nas duas telas.
 *
 * O mesmo post pode aparecer 2x na página (ele mesmo e como repost de alguém),
 * então contagens e estados são atualizados em TODA entrada com esse `id`.
 */
export function PostFeedList({
  posts,
  setPosts,
  timeStyle,
  followingLabel = false,
}: {
  posts: PostDTO[];
  setPosts: Dispatch<SetStateAction<PostDTO[]>>;
  timeStyle: "relative" | "clock";
  followingLabel?: boolean;
}) {
  const user = useCurrentUser();
  const router = useRouter();

  const handlePostDeleted = useCallback((id: string) => setPosts((prev) => prev.filter((p) => p.id !== id)), [setPosts]);

  const handleCommentCountChange = useCallback(
    (postId: string, count: number) => setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: count } : p))),
    [setPosts]
  );

  // `confirmed` distingue a atualização otimista (reversível) da confirmação do servidor
  // (só aí é seguro remover a entrada "eu repostei" que acabou de ser desfeita).
  const handleRepostChange = useCallback(
    (postId: string, reposted: boolean, confirmed: boolean) => {
      setPosts((prev) => {
        const updated = prev.map((p) => (p.id === postId ? { ...p, repostedByMe: reposted } : p));
        if (!confirmed || reposted || !user) return updated;
        return updated.filter((p) => !(p.id === postId && p.repostedBy?.id === user.id));
      });
    },
    [setPosts, user]
  );

  const handleLikeChange = useCallback(
    (postId: string, liked: boolean, likeCount: number) => setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likeCount } : p))),
    [setPosts]
  );

  const handleReportChange = useCallback(
    (postId: string, reported: boolean) => setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reportedByMe: reported } : p))),
    [setPosts]
  );

  const handleQuote = useCallback((post: PostDTO) => router.push(quoteHref(post)), [router]);

  return (
    <Box>
      {posts.map((post) => (
        // Um repost resolve pro MESMO `post.id` do original — a chave diferencia por QUEM repostou.
        <PostCard
          key={`${post.id}:${post.repostedBy?.id ?? "self"}`}
          post={post}
          timeStyle={timeStyle}
          followingLabel={followingLabel}
          onDeleted={handlePostDeleted}
          onQuote={handleQuote}
          onCommentCountChange={handleCommentCountChange}
          onRepostChange={handleRepostChange}
          onLikeChange={handleLikeChange}
          onReportChange={handleReportChange}
        />
      ))}
    </Box>
  );
}
