"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Typography } from "@mui/material";
import { PostCard } from "@/components/PostCard";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { quoteHref } from "@/lib/publishLinks";
import type { PostDTO } from "@/lib/postDto";

/** Evento global: "a lista de publicações mudou, recarregue". */
export const POSTS_CHANGED_EVENT = "animehub:posts-changed";

/**
 * Posts de um único autor (perfil público) — mesmo padrão de scroll
 * infinito do FeedView, só que sobre GET /api/users/[id]/posts em vez de
 * GET /api/posts.
 */
export function UserPostList({
  userId,
  endpoint,
  params,
  emptyText = "Nenhum post ainda.",
  timeStyle = "relative",
}: {
  /** "clock" mostra HH:mm no fuso da conta (Figma: hashtag, Seguindo, Recentes). */
  timeStyle?: "relative" | "clock";
  /** Perfil público: posts desta pessoa. */
  userId?: string;
  /** Alternativa genérica (ex.: discussões de uma obra): GET que devolve { posts, nextCursor }. */
  endpoint?: string;
  params?: Record<string, string>;
  emptyText?: string;
}) {
  const base = endpoint ?? `/api/users/${userId}/posts`;
  const extra = JSON.stringify(params ?? {});
  const router = useRouter();
  const user = useCurrentUser();
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
    hasMoreRef.current = hasMore;
  });

  const loadPage = useCallback(
    async (cursorArg: string | null, replace: boolean) => {
      const query = new URLSearchParams(JSON.parse(extra) as Record<string, string>);
      if (cursorArg) query.set("cursor", cursorArg);
      const res = await fetch(`${base}?${query.toString()}`);
      if (!res.ok) throw new Error("falha ao carregar");
      const data = await res.json();
      const newPosts: PostDTO[] = data.posts ?? [];
      setPosts((prev) => (replace ? newPosts : [...prev, ...newPosts]));
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    },
    [base, extra]
  );

  const initialLoad = useCallback(() => {
    setLoading(true);
    setFailed(false);
    loadPage(null, true)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [loadPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initialLoad();
  }, [initialLoad]);

  // Quando outra parte da tela publica algo (ex.: "Publicar sobre este
  // anime" no detalhe da obra), recarrega a primeira página sem piscar o
  // estado de "Carregando".
  useEffect(() => {
    function onChanged() {
      void loadPage(null, true);
    }
    window.addEventListener(POSTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(POSTS_CHANGED_EVENT, onChanged);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    setLoadingMore(true);
    loadPage(cursor, false)
      .catch(() => setFailed(true))
      .finally(() => setLoadingMore(false));
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

  // Idem pra denúncia — o último campo "por post" que ainda vivia em
  // estado local do PostCard (achado real da 20ª rodada de auditoria,
  // Epic 18).
  const handleReportChange = useCallback((postId: string, reported: boolean) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reportedByMe: reported } : p)));
  }, []);

  // Esta tela não tem compositor próprio — "Citar" abre o editor
  // "Nova publicação" (/publicar) já referenciando o post (PostCard já
  // garante, antes de chamar isto, que o viewer está logado).
  function handleQuote(post: PostDTO) {
    router.push(quoteHref(post));
  }

  if (loading) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Carregando posts...
      </Typography>
    );
  }

  if (failed && posts.length === 0) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={initialLoad}>
            Tentar de novo
          </Button>
        }
      >
        Não foi possível carregar. Isso não quer dizer que não há publicações.
      </Alert>
    );
  }

  if (posts.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {emptyText}
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
          timeStyle={timeStyle}
          onDeleted={handlePostDeleted}
          onQuote={handleQuote}
          onCommentCountChange={handleCommentCountChange}
          onRepostChange={handleRepostChange}
          onLikeChange={handleLikeChange}
          onReportChange={handleReportChange}
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
