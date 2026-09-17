"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { PostCard } from "@/components/PostCard";
import { FollowToggle } from "@/components/FollowToggle";
import { LinkButton } from "@/components/LinkButton";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { PostDTO } from "@/lib/postDto";

type FeedTab = "recommended" | "following";
type MyAnime = { id: string; titleRomaji: string; titleEnglish: string | null };
type Suggestion = { id: string; displayName: string };
type Quoting = { id: string; author: string; snippet: string };

const MAX_BODY_LENGTH = 500;
const MAX_IMAGES = 6;

export function FeedView() {
  const user = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loggedOut = user === null;
  const [tab, setTab] = useState<FeedTab>("recommended");
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  // Fixa o instante usado pra pontuação da aba "Recomendado" durante toda a
  // sessão de rolagem — sem isso, cada página recalculava a pontuação com o
  // relógio da própria requisição, e a ordem podia trocar entre uma página
  // e a próxima só pelo tempo passar, sem curtida/post novo nenhum,
  // pulando/repetindo posts (achado real da 15ª rodada de auditoria, Epic
  // 18). Renovado a cada resetAndLoad (troca de aba, recarregar a 1ª página).
  const [since, setSince] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const [myAnime, setMyAnime] = useState<MyAnime[]>([]);
  const [composerAnimeId, setComposerAnimeId] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerImageUrls, setComposerImageUrls] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Modo citação (Epic 25) — setado pelo botão "Citar" de um PostCard
  // (aqui no próprio Feed) ou por navegação vinda do perfil de outro
  // usuário (UserPostList.tsx não tem compositor próprio, então "Citar"
  // lá volta pro Feed com esses 3 parâmetros na URL).
  const [quoting, setQuoting] = useState<Quoting | null>(null);

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
  // Guarda síncrona pra clique duplo/triplo rápido no "Publicar" — o
  // `disabled={posting}` do botão só reflete depois do próximo render, e
  // um clique real (não sintético) pode disparar de novo antes disso,
  // criando posts duplicados (achado real da 5ª rodada de auditoria,
  // Epic 18). Um ref é síncrono, não espera render nenhum.
  const postingRef = useRef(false);

  useEffect(() => {
    // Deslogado não tem lista própria (a chamada só voltaria 401) — o
    // composer vira um CTA de login em vez de buscar nada.
    if (!user) return;
    fetch("/api/anime")
      .then((res) => res.json())
      .then((data) => setMyAnime(data.animes ?? []));
  }, [user]);

  // "Citar" a partir do perfil de outra pessoa (UserPostList.tsx, que não
  // tem compositor próprio) volta pro Feed com esses 3 parâmetros —
  // consome uma vez ao montar e limpa a URL (router.replace, sem
  // recarregar) pra não reabrir o mesmo modo citação numa navegação
  // futura de volta pra "/".
  useEffect(() => {
    const quotePostId = searchParams.get("quotePostId");
    if (!quotePostId) return;
    // Consome um parâmetro de URL vindo de outra tela, não estado interno
    // recalculado — sem efeito não tem outro jeito de ler a URL na
    // montagem antes do 1º render útil.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuoting({
      id: quotePostId,
      author: searchParams.get("quoteAuthor") ?? "",
      snippet: searchParams.get("quoteSnippet") ?? "",
    });
    router.replace("/");
    // Só na montagem, de propósito: `searchParams`/`router` mudam de
    // referência a cada navegação, e reagir a eles de novo reabriria o
    // modo citação depois do próprio `router.replace` acima limpar a URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Seguindo" não existe sem conta — se a sessão cair (ou nunca existiu)
  // enquanto essa aba está selecionada, volta pra "Recomendado", a única
  // leitura pública do feed.
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
    async (
      targetTab: FeedTab,
      cursorArg: string | null,
      offsetArg: number,
      replace: boolean,
      sinceArg: string | null
    ) => {
      const params = new URLSearchParams({ tab: targetTab });
      if (targetTab === "following" && cursorArg) params.set("cursor", cursorArg);
      if (targetTab === "recommended") {
        if (offsetArg) params.set("offset", String(offsetArg));
        if (sinceArg) params.set("since", sinceArg);
      }
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
        if (typeof data.since === "string") setSince(data.since);
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
      setSince(null);
      loadPage(targetTab, null, 0, true, null).finally(() => setLoading(false));
    },
    [loadPage]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetAndLoad(tab);
  }, [tab, resetAndLoad]);

  // Recarrega a página quando login/logout muda de verdade (não a 1ª vez
  // que `useCurrentUser()` resolve de "carregando" pra um valor conhecido,
  // que o efeito acima já cobre sozinho) — sem isso, deslogar não invalida
  // os posts já carregados: `isMine`/`likedByMe`/`reportedByMe` continuam
  // refletindo a sessão antiga (ex.: o ícone de apagar post ainda aparece
  // em posts que eram "meus" antes de sair), já que só a árvore de Server
  // Components é revalidada por `router.refresh()` no logout — o fetch do
  // próprio FeedView não é. `null` no ref (nunca "já sabíamos que é
  // true/false") marca "ainda não vi o 1º estado confirmado".
  const wasLoggedInRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (user === undefined) return;
    const isLoggedIn = Boolean(user);
    if (wasLoggedInRef.current !== null && wasLoggedInRef.current !== isLoggedIn) {
      // Deslogar enquanto em "Seguindo" já vai disparar seu próprio
      // resetAndLoad (pro "Recomendado") através do efeito acima, que força
      // a troca de aba nesse caso — recarregar aqui também só gastaria uma
      // requisição a mais pra "Seguindo" sabendo de antemão que vai 401
      // (a guarda de `loadPage` descarta a resposta com segurança, mas não
      // custa evitar o disparo).
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
    loadPage(tab, cursor, offset, false, since).finally(() => setLoadingMore(false));
  }, [tab, cursor, offset, since, loadPage]);

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

  // O MESMO post pode aparecer 2x nesta página (uma vez como ele mesmo,
  // outra como repost de alguém — ver src/lib/postFeedDto.ts), então a
  // contagem de comentário precisa ser atualizada em TODA entrada com
  // esse `id`, não só na instância de PostCard onde a thread foi aberta
  // (achado real da 18ª rodada de auditoria, Epic 18).
  const handleCommentCountChange = useCallback((postId: string, count: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: count } : p)));
  }, []);

  // Mesmo raciocínio pro repost: `confirmed` distingue a atualização
  // otimista (só troca o ícone em toda entrada com esse id — reversível
  // sem perda se a requisição falhar) da confirmação do servidor (só aí
  // é seguro remover do feed a entrada "eu repostei" que acabou de ser
  // desfeita — removê-la otimisticamente antes de saber se a requisição
  // teve sucesso deixaria a entrada perdida pra sempre num rollback).
  // Sem isso, desfazer um repost deixava a faixa "Fulano repostou" e o
  // card presos na tela até recarregar, e uma 2ª instância do mesmo post
  // ficava com o ícone de repost desatualizado (achado real da 18ª
  // rodada de auditoria, Epic 18).
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

  // Mesmo raciocínio de handleCommentCountChange/handleRepostChange acima
  // — LikeToggle.tsx tinha ficado de fora da correção da 18ª rodada e
  // carregava o mesmo bug: curtir numa instância não refletia na outra
  // instância do mesmo post (achado real da 19ª rodada de auditoria,
  // Epic 18).
  const handleLikeChange = useCallback((postId: string, liked: boolean, likeCount: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likeCount } : p)));
  }, []);

  function handleQuote(post: PostDTO) {
    setQuoting({ id: post.id, author: post.author.displayName, snippet: post.body.slice(0, 80) });
  }

  async function handleSubmit() {
    const text = composerBody.trim();
    if (!composerAnimeId || !text) return;
    if (postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError(null);
    try {
      const imageUrls = composerImageUrls
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean)
        .slice(0, MAX_IMAGES);
      const res = await fetch(`/api/anime/${composerAnimeId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          imageUrls,
          quotedPostId: quoting?.id,
        }),
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
      setComposerImageUrls("");
      setQuoting(null);
    } catch {
      setError("Falha ao publicar post");
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Recomendado" value="recommended" />
        {user && <Tab label="Seguindo" value="following" />}
      </Tabs>

      <Box sx={{ mb: 3, p: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
        {loggedOut ? (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Entre pra publicar no feed.
            </Typography>
            <LinkButton href="/login" variant="contained" size="small">
              Entrar
            </LinkButton>
          </Stack>
        ) : user === undefined ? (
          // Ainda carregando /api/auth/me (nem logado nem deslogado
          // confirmado ainda) — sem esse estado à parte, um visitante
          // deslogado via um flash rápido de "adicione um anime" (o
          // mesmo texto de quem está logado mas sem lista) antes do
          // fetch confirmar e trocar pro CTA de login correto.
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Carregando...
          </Typography>
        ) : myAnime.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Adicione um anime à sua lista pra poder postar no feed.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {quoting && (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: "center",
                  justifyContent: "space-between",
                  p: 1,
                  bgcolor: "background.default",
                  borderRadius: 1,
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 0 }} noWrap>
                  Citando post de {quoting.author}: &ldquo;{quoting.snippet}&rdquo;
                </Typography>
                <IconButton onClick={() => setQuoting(null)} size="small" aria-label="Cancelar citação">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            )}
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
              value={composerImageUrls}
              onChange={(e) => setComposerImageUrls(e.target.value)}
              placeholder={`URLs de imagem (opcional, uma por linha, até ${MAX_IMAGES})`}
              size="small"
              multiline
              maxRows={MAX_IMAGES}
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
          {posts.map((post) => (
            // Um repost resolve pro MESMO `post.id` do original (curtida/
            // comentário sempre agem sobre o original — ver
            // src/lib/postFeedDto.ts) — então o mesmo post pode aparecer
            // 2x na mesma página (uma vez como ele mesmo, outra como
            // repost de alguém), com `id` igual nas duas. A chave precisa
            // diferenciar por QUEM repostou (ou "self" pro post original
            // em si), senão o React vê 2 filhos com a mesma key (achado
            // real de verificação ao vivo, Epic 25).
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
      )}
    </Box>
  );
}
