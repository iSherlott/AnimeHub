"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { PostCard } from "@/components/PostCard";
import type { PostDTO } from "@/lib/postDto";

/**
 * Posts de um único autor (perfil público) — mesmo padrão de scroll
 * infinito do FeedView, só que sobre GET /api/users/[id]/posts em vez de
 * GET /api/posts.
 */
export function UserPostList({ userId }: { userId: string }) {
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
        <PostCard key={post.id} post={post} onDeleted={handlePostDeleted} />
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
