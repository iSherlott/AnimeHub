"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { Alert, Box, Button, Link as MuiLink, Stack, Tab, Tabs, Typography } from "@mui/material";
import { PostFeedList } from "@/components/PostFeedList";
import { FeedComposer } from "@/components/FeedComposer";
import { FollowToggle } from "@/components/FollowToggle";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import type { PostDTO } from "@/lib/postDto";

type FeedTab = "recommended" | "following" | "recent";
type Suggestion = { id: string; displayName: string };

const EXPLAINERS: Record<FeedTab, string[]> = {
  recommended: [
    "Publicações recentes com mais curtidas. Esta ordem não é cronológica e é a mesma para todo mundo; sua Minha Lista não entra na conta.",
  ],
  following: ["Publicações dos seus amigos e dos perfis que você segue, da mais nova para a mais antiga."],
  recent: [
    "Conversas públicas em ordem cronológica, da mais nova para a mais antiga.",
    "Primeira visita? Comece por uma pergunta ou explore uma hashtag. Não precisamos conhecer seus interesses para mostrar conversas públicas.",
  ],
};

/**
 * Feed da Comunidade (Figma `13:41181` / `13:41417` / `13:41628`): abas Para
 * você · Seguindo · Recentes com texto explicando a ordem, publicações sem
 * cartão e rolagem infinita. Publicar é no campo do topo, como no X
 * (`FeedComposer`); o editor completo continua em `/publicar`.
 */
export function FeedView() {
  const user = useCurrentUser();
  const loggedOut = user === null;
  const [tab, setTab] = useState<FeedTab>("recommended");
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  // Fixa o instante usado pra pontuação da aba "Para você" durante toda a
  // sessão de paginação — sem isso, cada página recalculava a pontuação com
  // o relógio da própria requisição e a ordem podia trocar entre páginas,
  // pulando/repetindo posts (achado real da 15ª rodada, Epic 18).
  const [since, setSince] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  // Falha de rede/servidor ao carregar a lista NÃO pode parecer "feed vazio".
  const [loadFailed, setLoadFailed] = useState(false);

  // Espelha loadingMore/hasMore/tab num ref pro callback de "ver mais" ler o
  // valor mais recente sem recriar handlers; a escrita acontece em efeito.
  const loadingMoreRef = useRef(loadingMore);
  const hasMoreRef = useRef(hasMore);
  const tabRef = useRef(tab);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
    hasMoreRef.current = hasMore;
    tabRef.current = tab;
  });

  // "Seguindo" não existe sem conta — se a sessão cair (ou nunca existiu)
  // enquanto essa aba está selecionada, volta pra "Para você".
  useEffect(() => {
    if (loggedOut && tab === "following") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab("recommended");
    }
  }, [loggedOut, tab]);

  const loadFollowingSuggestions = useCallback(() => {
    fetch("/api/users/suggestions")
      .then((res) => res.json())
      .then((data) => setSuggestions(data.users ?? []));
  }, []);

  const loadPage = useCallback(
    async (targetTab: FeedTab, cursorArg: string | null, offsetArg: number, replace: boolean, sinceArg: string | null) => {
      const params = new URLSearchParams({ tab: targetTab });
      if ((targetTab === "following" || targetTab === "recent") && cursorArg) params.set("cursor", cursorArg);
      if (targetTab === "recommended") {
        if (offsetArg) params.set("offset", String(offsetArg));
        if (sinceArg) params.set("since", sinceArg);
      }
      const res = await fetch(`/api/posts?${params.toString()}`);
      if (!res.ok) throw new Error("falha ao carregar o feed");
      const data = await res.json();
      // Uma troca de aba pode deixar este fetch "para trás" — sem essa guarda,
      // a resposta tardia mistura posts de uma aba na state da outra.
      if (targetTab !== tabRef.current) return;
      const newPosts: PostDTO[] = data.posts ?? [];
      setPosts((prev) => (replace ? newPosts : [...prev, ...newPosts]));

      if (targetTab === "following" || targetTab === "recent") {
        setCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.nextCursor));
        if (targetTab === "following" && replace && newPosts.length === 0) {
          loadFollowingSuggestions();
        } else if (replace) {
          setSuggestions(null);
        }
      } else {
        setOffset(typeof data.nextOffset === "number" ? data.nextOffset : offsetArg);
        setHasMore(typeof data.nextOffset === "number");
        if (typeof data.since === "string") setSince(data.since);
        if (replace) setSuggestions(null);
      }
    },
    [loadFollowingSuggestions]
  );

  /** Reseta a paginação e busca a primeira página (troca de aba ou de sessão). */
  const resetAndLoad = useCallback(
    (targetTab: FeedTab) => {
      setLoading(true);
      setCursor(null);
      setOffset(0);
      setHasMore(true);
      setSince(null);
      setLoadFailed(false);
      loadPage(targetTab, null, 0, true, null)
        .catch(() => {
          // Posts da aba anterior não podem ficar à mostra sob a aba nova que falhou.
          setPosts([]);
          setLoadFailed(true);
        })
        .finally(() => setLoading(false));
    },
    [loadPage]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetAndLoad(tab);
  }, [tab, resetAndLoad]);

  // Recarrega quando login/logout muda de verdade (não a 1ª vez que
  // `useCurrentUser()` resolve): deslogar precisa invalidar `isMine`/
  // `likedByMe`/`reportedByMe` dos posts já carregados.
  const wasLoggedInRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (user === undefined) return;
    const isLoggedIn = Boolean(user);
    if (wasLoggedInRef.current !== null && wasLoggedInRef.current !== isLoggedIn) {
      const willBeForcedOffFollowing = !isLoggedIn && tab === "following";
      if (!willBeForcedOffFollowing) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        resetAndLoad(tab);
      }
    }
    wasLoggedInRef.current = isLoggedIn;
  }, [user, tab, resetAndLoad]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    setLoadingMore(true);
    loadPage(tab, cursor, offset, false, since)
      .catch(() => setLoadFailed(true))
      .finally(() => setLoadingMore(false));
  }, [tab, cursor, offset, since, loadPage]);

  // Rolagem infinita: o sentinela no fim da lista pede a próxima página antes de ela chegar à tela.
  const { ref: sentinelRef, supported: infiniteSupported } = useInfiniteScroll(loadMore, hasMore && !loading && !loadFailed, posts.length);

  const timeStyle = tab === "recommended" ? "relative" : "clock";

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Feed da Comunidade">
        <Tab label="Para você" value="recommended" />
        {user && <Tab label="Seguindo" value="following" />}
        <Tab label="Recentes" value="recent" />
      </Tabs>

      {/* A publicação nova aparece no topo da aba aberta, sem recarregar o Feed. */}
      <FeedComposer onPosted={(post) => setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)])} />

      <Stack spacing={2} sx={{ mt: 2, mb: 1 }}>
        {EXPLAINERS[tab].map((text, i) => (
          <Typography
            key={text}
            data-testid={tab === "recommended" && i === 0 ? "for-you-explainer" : undefined}
            sx={{ fontSize: i === 0 ? 14 : tab === "recommended" ? 12 : 14, color: "text.secondary" }}
          >
            {text}
          </Typography>
        ))}
      </Stack>

      {loading ? (
        <Typography sx={{ color: "text.secondary", fontSize: 14, py: 3 }}>Carregando feed...</Typography>
      ) : loadFailed && posts.length === 0 ? (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => resetAndLoad(tab)}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar o feed. Isso não quer dizer que ele está vazio.
        </Alert>
      ) : posts.length === 0 ? (
        <Box sx={{ py: 3 }}>
          <Typography sx={{ color: "text.secondary", fontSize: 14, mb: suggestions?.length ? 2 : 0 }}>
            {tab === "following"
              ? "Você ainda não segue ninguém — ou quem você segue ainda não postou nada."
              : "Nenhum post ainda. Seja o primeiro."}
          </Typography>
          {suggestions && suggestions.length > 0 && (
            <Stack spacing={1}>
              <Typography sx={{ color: "text.secondary", fontSize: 12 }}>Sugestões de quem seguir</Typography>
              {suggestions.map((s) => (
                <Stack key={s.id} direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                  <MuiLink component={NextLink} href={`/users/${s.id}`} underline="hover" sx={{ color: "text.primary" }}>
                    {s.displayName}
                  </MuiLink>
                  <FollowToggle
                    userId={s.id}
                    initialFollowing={false}
                    onChange={(following) => {
                      if (following) loadPage("following", null, 0, true, null);
                    }}
                  />
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      ) : (
        <Box>
          <PostFeedList posts={posts} setPosts={setPosts} timeStyle={timeStyle} followingLabel={tab === "following"} />
          {hasMore && <Box ref={sentinelRef} data-testid="feed-sentinel" aria-hidden sx={{ height: 1 }} />}
          {loadingMore && (
            <Typography role="status" sx={{ mt: 2, fontSize: 14, color: "text.secondary" }}>
              Carregando mais conversas…
            </Typography>
          )}
          {hasMore && !infiniteSupported && (
            <Button
              onClick={loadMore}
              disabled={loadingMore}
              sx={{ mt: 3, bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}
            >
              Ver mais conversas
            </Button>
          )}
          {!hasMore && (
            <Typography data-testid="feed-end" sx={{ mt: 3, fontSize: 13, color: "text.secondary", textAlign: "center" }}>
              Você chegou ao fim do feed.
            </Typography>
          )}
          {loadFailed && (
            <Alert
              severity="error"
              sx={{ mt: 2 }}
              action={
                <Button color="inherit" size="small" onClick={() => { setLoadFailed(false); loadMore(); }}>
                  Tentar de novo
                </Button>
              }
            >
              Não foi possível carregar mais conversas.
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
