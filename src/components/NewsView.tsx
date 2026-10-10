"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import NewspaperOutlinedIcon from "@mui/icons-material/NewspaperOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { Box, Button, InputBase, Tab, Tabs, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { PostFeedList } from "@/components/PostFeedList";
import { EmptyState, ErrorNotice } from "@/components/StatePanels";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { loginHref } from "@/lib/safeRedirect";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import type { PostDTO } from "@/lib/postDto";

type Scope = "all" | "following";

/**
 * Notícias da Comunidade: publicações do NewsHub, no mesmo formato do feed
 * (cartão, # da obra, curtir, comentar, repostar), em rolagem infinita.
 * "Todas", "Que sigo" (obras da Minha Lista) e busca por obra, assunto ou #.
 */
export function NewsView() {
  const user = useCurrentUser();
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const moreBusy = useRef(false);
  const inputId = useId();

  const fetchPage = useCallback(async (targetScope: Scope, q: string, after: string | null) => {
    const params = new URLSearchParams({ scope: targetScope });
    if (q) params.set("q", q);
    if (after) params.set("cursor", after);
    const res = await fetch(`/api/posts/news?${params.toString()}`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { posts: PostDTO[]; nextCursor: string | null };
  }, []);

  const reload = useCallback(
    (targetScope: Scope, q: string) => {
      const id = ++requestId.current;
      moreBusy.current = false;
      setLoading(true);
      setFailed(false);
      fetchPage(targetScope, q, null)
        .then((data) => {
          if (id !== requestId.current) return;
          setPosts(data.posts);
          setCursor(data.nextCursor);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setPosts([]);
          setCursor(null);
          setFailed(true);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    },
    [fetchPage]
  );

  const needsLogin = scope === "following" && user === null;
  useEffect(() => {
    // "Que sigo" não existe sem conta: nada a buscar até entrar.
    if (needsLogin || (scope === "following" && user === undefined)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload(scope, applied);
  }, [scope, applied, needsLogin, user, reload]);

  const loadMore = useCallback(() => {
    if (!cursor || moreBusy.current) return;
    moreBusy.current = true;
    const id = requestId.current;
    setLoadingMore(true);
    fetchPage(scope, applied, cursor)
      .then((data) => {
        if (id !== requestId.current) return;
        setPosts((prev) => [...prev, ...data.posts.filter((p) => !prev.some((x) => x.id === p.id))]);
        setCursor(data.nextCursor);
      })
      .catch(() => {
        if (id === requestId.current) setFailed(true);
      })
      .finally(() => {
        moreBusy.current = false;
        setLoadingMore(false);
      });
  }, [cursor, scope, applied, fetchPage]);

  const hasMore = cursor !== null;
  const { ref: sentinelRef, supported } = useInfiniteScroll(loadMore, hasMore && !loading && !failed, posts.length);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setApplied(query.trim());
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box component="form" onSubmit={submit} role="search" aria-label="Buscar notícias" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography component="label" htmlFor={inputId} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
          Busca nas notícias
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 2, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "10px", "&:focus-within": { borderColor: "text.secondary" } }}>
          <InputBase id={inputId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por obra, assunto ou #hashtag" fullWidth inputProps={{ maxLength: 80 }} sx={{ fontSize: 14, p: 0, "& input": { p: 0 } }} />
          <Button type="submit" aria-label="Buscar notícias" sx={{ minWidth: 32, p: 0.5, color: "text.primary" }}>
            <SearchIcon sx={{ fontSize: 18 }} />
          </Button>
        </Box>
      </Box>

      <Box>
        <Tabs value={scope} onChange={(_, v: Scope) => setScope(v)} aria-label="Escopo das notícias">
          <Tab label="Todas" value="all" data-testid="news-tab-all" />
          <Tab label="Que sigo" value="following" data-testid="news-tab-following" />
        </Tabs>
        <Typography sx={{ mt: 2, fontSize: 14, color: "text.secondary" }}>
          {scope === "following" ? "Notícias das obras da sua Minha Lista, publicadas pelo @newshub." : "Notícias das obras da temporada atual, publicadas pelo @newshub, da mais nova para a mais antiga."}
          {applied ? ` Filtrando por “${applied}”.` : ""}
        </Typography>
      </Box>

      {needsLogin ? (
        <EmptyState testId="news-login" icon={<NewspaperOutlinedIcon />} title="Entre para ver as notícias do que você acompanha." action={<Button href={loginHref("/noticias")} sx={ELEVATED_BUTTON_SX}>Entrar</Button>}>
          As notícias de “Que sigo” vêm das obras da sua Minha Lista.
        </EmptyState>
      ) : failed && posts.length === 0 ? (
        <ErrorNotice testId="news-error" title="Não foi possível carregar as notícias." onRetry={() => reload(scope, applied)}>
          Sua busca e o escopo foram mantidos.
        </ErrorNotice>
      ) : loading ? (
        <Typography role="status" sx={{ fontSize: 14, color: "text.secondary" }}>
          Carregando notícias…
        </Typography>
      ) : posts.length === 0 ? (
        <EmptyState testId="news-empty" icon={<ArticleOutlinedIcon />} title={applied ? "Nenhuma notícia encontrada." : scope === "following" ? "Nenhuma notícia das obras que você segue." : "Ainda não há notícias."}>
          {applied ? "Tente outro nome de obra, assunto ou #hashtag." : scope === "following" ? "Acompanhe obras da temporada para ver o que sai sobre elas." : "As notícias aparecem aqui depois da próxima busca."}
        </EmptyState>
      ) : (
        <Box data-testid="news-list">
          <PostFeedList posts={posts} setPosts={setPosts} timeStyle="relative" />
          {hasMore && <Box ref={sentinelRef} data-testid="news-sentinel" aria-hidden sx={{ height: 1 }} />}
          {loadingMore && (
            <Typography role="status" sx={{ mt: 2, fontSize: 14, color: "text.secondary" }}>
              Carregando mais notícias…
            </Typography>
          )}
          {hasMore && !supported && (
            <Button onClick={loadMore} disabled={loadingMore} sx={{ mt: 3, ...ELEVATED_BUTTON_SX }} data-testid="news-more">
              Ver mais notícias
            </Button>
          )}
          {failed && (
            <Box sx={{ mt: 2 }}>
              <ErrorNotice title="Não foi possível carregar mais notícias." onRetry={() => { setFailed(false); loadMore(); }} />
            </Box>
          )}
          {!hasMore && (
            <Typography data-testid="news-end" sx={{ mt: 3, fontSize: 13, color: "text.secondary", textAlign: "center" }}>
              Você chegou ao fim das notícias.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
