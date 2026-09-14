"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { PostCard } from "@/components/PostCard";
import { FollowToggle } from "@/components/FollowToggle";
import type { PostDTO } from "@/lib/postDto";

type FeedTab = "recommended" | "following";
type MyAnime = { id: string; titleRomaji: string; titleEnglish: string | null };
type Suggestion = { id: string; displayName: string };

const MAX_BODY_LENGTH = 500;

export function FeedView() {
  const [tab, setTab] = useState<FeedTab>("recommended");
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const [myAnime, setMyAnime] = useState<MyAnime[]>([]);
  const [composerAnimeId, setComposerAnimeId] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerImageUrl, setComposerImageUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Espelha loadingMore/hasMore/tab num ref pro callback do IntersectionObserver
  // (que não re-executa a cada render) ler o valor mais recente sem precisar
  // recriar o observer toda hora. A escrita no ref acontece dentro de um
  // efeito, não durante o render — react-hooks/refs proíbe só a segunda.
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  const tabRef = useRef(tab);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
    hasMoreRef.current = hasMore;
    tabRef.current = tab;
  });

  useEffect(() => {
    fetch("/api/anime")
      .then((res) => res.json())
      .then((data) => setMyAnime(data.animes ?? []));
  }, []);

  const loadFollowingSuggestions = useCallback(() => {
    fetch("/api/users/suggestions")
      .then((res) => res.json())
      .then((data) => setSuggestions(data.users ?? []));
  }, []);

  const loadPage = useCallback(
    async (targetTab: FeedTab, cursorArg: string | null, offsetArg: number, replace: boolean) => {
      const params = new URLSearchParams({ tab: targetTab });
      if (targetTab === "following" && cursorArg) params.set("cursor", cursorArg);
      if (targetTab === "recommended" && offsetArg) params.set("offset", String(offsetArg));
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      // Uma troca de aba pode deixar este fetch "para trás" (ex.: um
      // loadMore da aba antiga ainda em voo quando o usuário já trocou de
      // aba) — sem essa guarda, a resposta tardia mistura posts de uma
      // aba na state da outra e corrompe a paginação dela.
      if (targetTab !== tabRef.current) return;
      const newPosts: PostDTO[] = data.posts ?? [];
      setPosts((prev) => (replace ? newPosts : [...prev, ...newPosts]));

      if (targetTab === "following") {
        setCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.nextCursor));
        if (replace && newPosts.length === 0) {
          loadFollowingSuggestions();
        } else if (replace) {
          setSuggestions(null);
        }
      } else {
        setOffset(typeof data.nextOffset === "number" ? data.nextOffset : offsetArg);
        setHasMore(typeof data.nextOffset === "number");
        if (replace) setSuggestions(null);
      }
    },
    [loadFollowingSuggestions]
  );

  /**
   * Reseta a paginação e busca a primeira página quando a aba muda —
   * função à parte (não inline no corpo do efeito) chamada com um único
   * disable, mesmo padrão de loadAll() em AdminDashboard.tsx.
   */
  const resetAndLoad = useCallback(
    (targetTab: FeedTab) => {
      setLoading(true);
      setCursor(null);
      setOffset(0);
      setHasMore(true);
      loadPage(targetTab, null, 0, true).finally(() => setLoading(false));
    },
    [loadPage]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetAndLoad(tab);
  }, [tab, resetAndLoad]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    setLoadingMore(true);
    loadPage(tab, cursor, offset, false).finally(() => setLoadingMore(false));
  }, [tab, cursor, offset, loadPage]);

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

  async function handleSubmit() {
    const text = composerBody.trim();
    if (!composerAnimeId || !text) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${composerAnimeId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, imageUrl: composerImageUrl.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao publicar post");
        return;
      }
      if (tab === "recommended") {
        setPosts((prev) => [data.post as PostDTO, ...prev]);
      }
      setComposerBody("");
      setComposerImageUrl("");
    } catch {
      setError("Falha ao publicar post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Recomendado" value="recommended" />
        <Tab label="Seguindo" value="following" />
      </Tabs>

      <Box sx={{ mb: 3, p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
        {myAnime.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Adicione um anime à sua lista pra poder postar no feed.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <TextField
              select
              label="Anime"
              size="small"
              value={composerAnimeId}
              onChange={(e) => setComposerAnimeId(e.target.value)}
            >
              {myAnime.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.titleRomaji}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              value={composerBody}
              onChange={(e) => setComposerBody(e.target.value.slice(0, MAX_BODY_LENGTH))}
              placeholder="O que você achou desse anime?"
              size="small"
              multiline
              maxRows={4}
              helperText={`${composerBody.length}/${MAX_BODY_LENGTH}`}
            />
            <TextField
              value={composerImageUrl}
              onChange={(e) => setComposerImageUrl(e.target.value)}
              placeholder="URL de imagem (opcional)"
              size="small"
            />
            <Box>
              <Button
                onClick={handleSubmit}
                disabled={posting || !composerAnimeId || !composerBody.trim()}
                variant="contained"
              >
                Publicar
              </Button>
            </Box>
          </Stack>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Carregando feed...
        </Typography>
      ) : posts.length === 0 ? (
        <Box>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: suggestions?.length ? 2 : 0 }}>
            {tab === "following"
              ? "Você ainda não segue ninguém — ou quem você segue ainda não postou nada."
              : "Nenhum post ainda. Seja o primeiro."}
          </Typography>
          {suggestions && suggestions.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Sugestões de quem seguir
              </Typography>
              {suggestions.map((s) => (
                <Stack
                  key={s.id}
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography variant="body2">{s.displayName}</Typography>
                  <FollowToggle
                    userId={s.id}
                    initialFollowing={false}
                    onChange={(following) => {
                      if (following) loadPage("following", null, 0, true);
                    }}
                  />
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      ) : (
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
      )}
    </Box>
  );
}
