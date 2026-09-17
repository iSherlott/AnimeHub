"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { PostCard } from "@/components/PostCard";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { PostDTO } from "@/lib/postDto";

/**
 * Posts de um único autor (perfil público) — mesmo padrão de scroll
 * infinito do FeedView, só que sobre GET /api/users/[id]/posts em vez de
 * GET /api/posts.
 */
export function UserPostList({ userId }: { userId: string }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
    hasMoreRef.current = hasMore;
  });

  const loadPage = useCallback(
    async (cursorArg: string | null, replace: boolean) => {
      const params = new URLSearchParams();
      if (cursorArg) params.set("cursor", cursorArg);
      const res = await fetch(`/api/users/${userId}/posts?${params.toString()}`);
      const data = await res.json();
      const newPosts: PostDTO[] = data.posts ?? [];
      setPosts((prev) => (replace ? newPosts : [...prev, ...newPosts]));
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    },
    [userId]
  );

  const initialLoad = useCallback(() => {
    setLoading(true);
    loadPage(null, true).finally(() => setLoading(false));
  }, [loadPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initialLoad();
  }, [initialLoad]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    setLoadingMore(true);
    loadPage(cursor, false).finally(() => setLoadingMore(false));
  }, [cursor, loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  function handlePostDeleted(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  // Ver FeedView.tsx pra explicação completa — o mesmo post pode aparecer
  // 2x nesta lista (ele mesmo + repost de alguém), então contagem de
  // comentário e estado de repost precisam se propagar pra toda entrada
  // com o mesmo `id`, não só na instância clicada.
  const handleCommentCountChange = useCallback((postId: string, count: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: count } : p)));
  }, []);

  const handleRepostChange = useCallback(
    (postId: string, reposted: boolean, confirmed: boolean) => {
      setPosts((prev) => {
        const updated = prev.map((p) => (p.id === postId ? { ...p, repostedByMe: reposted } : p));
        if (!confirmed || reposted || !user) return updated;
        return updated.filter((p) => !(p.id === postId && p.repostedBy?.id === user.id));
      });
    },
    [user]
  );

  // Idem pra curtida (achado real da 19ª rodada de auditoria, Epic 18 —
  // LikeToggle.tsx tinha ficado de fora da correção da 18ª rodada).
  const handleLikeChange = useCallback((postId: string, liked: boolean, likeCount: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likeCount } : p)));
  }, []);

  // Esta tela (perfil público de outra pessoa) não tem compositor próprio
  // — "Citar" volta pro Feed (única tela com compositor) já em modo
  // citação, via parâmetros de URL que o FeedView consome uma vez ao
  // montar (PostCard já garante, antes de chamar isto, que o viewer está
  // logado — ver handleQuoteClick lá).
  function handleQuote(post: PostDTO) {
    const params = new URLSearchParams({
      quotePostId: post.id,
      quoteAuthor: post.author.displayName,
      quoteSnippet: post.body.slice(0, 80),
    });
    router.push(`/?${params.toString()}`);
  }

  if (loading) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Carregando posts...
      </Typography>
    );
  }

  if (posts.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Nenhum post ainda.
      </Typography>
    );
  }

  return (
    <Box>
      {posts.map((post) => (
        // Ver FeedView.tsx — um repost resolve pro MESMO `post.id` do
        // original, então precisa diferenciar a key por quem repostou
        // (ou "self") pro React não ver 2 filhos com a mesma key.
        <PostCard
          key={`${post.id}:${post.repostedBy?.id ?? "self"}`}
          post={post}
          onDeleted={handlePostDeleted}
          onQuote={handleQuote}
          onCommentCountChange={handleCommentCountChange}
          onRepostChange={handleRepostChange}
          onLikeChange={handleLikeChange}
        />
      ))}
      <Box ref={sentinelRef} sx={{ height: 1 }} />
      {loadingMore && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Carregando mais...
        </Typography>
      )}
    </Box>
  );
}
