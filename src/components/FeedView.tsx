"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loginHref } from "@/lib/safeRedirect";
import CloseIcon from "@mui/icons-material/Close";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Link as MuiLink,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ComposerImageAttachments, type ComposerImage } from "@/components/ComposerImageAttachments";
import { PostCard } from "@/components/PostCard";
import { FollowToggle } from "@/components/FollowToggle";
import { LinkButton } from "@/components/LinkButton";
import { CommunitySearchBox } from "@/components/CommunitySearchBox";
import { AnimeContextPicker, type RelatedAnime } from "@/components/AnimeContextPicker";
import { avatarColor, initials } from "@/lib/avatarColor";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { uploadImage } from "@/lib/uploadImage";
import type { PostDTO } from "@/lib/postDto";

type FeedTab = "recommended" | "following" | "recent";
type Suggestion = { id: string; displayName: string };
type Quoting = { id: string; author: string; snippet: string };

const MAX_BODY_LENGTH = 500;
const MAX_IMAGES = 6;

export function FeedView() {
  const pathname = usePathname();
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

  const [composerBody, setComposerBody] = useState("");
  const [composerSpoiler, setComposerSpoiler] = useState(false);
  // Contexto de obra OPCIONAL e EXPLÍCITO (Figma 13:41840): escolhido no
  // seletor "Anime relacionado"; hashtag/menção no texto nunca associa.
  const [relatedAnime, setRelatedAnime] = useState<RelatedAnime | null>(null);
  // Epic 26 — cada imagem sobe de verdade (POST /api/uploads) assim que
  // anexada, em paralelo entre elas, em vez do antigo campo de colar URL.
  // `uploadedUrl` só existe quando `status === "done"`; handleSubmit só
  // manda pro post as que já terminaram.
  const [composerImages, setComposerImages] = useState<ComposerImage[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Falha de rede/servidor ao carregar a lista NÃO pode parecer "feed vazio".
  const [loadFailed, setLoadFailed] = useState(false);
  // Modo citação (Epic 25) — setado pelo botão "Citar" de um PostCard
  // (aqui no próprio Feed) ou por navegação vinda do perfil de outro
  // usuário (UserPostList.tsx não tem compositor próprio, então "Citar"
  // lá volta pro Feed com esses 3 parâmetros na URL).
  const [quoting, setQuoting] = useState<Quoting | null>(null);
  const composerBodyRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

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

  // Move o foco pro campo de texto do compositor sempre que o modo citação
  // liga (pelo "Citar" de um card aqui mesmo, ou pelos parâmetros de URL
  // vindos de outra tela, ver efeito acima) — sem isso, só quem usa mouse
  // percebia a mudança (scroll automático da própria página até aqui);
  // teclado/leitor de tela não tinham nenhum sinal de que o modo citação
  // tinha ligado, e precisavam navegar manualmente até o compositor
  // (achado real da 22ª rodada de auditoria, Epic 18). Não dispara nada se
  // o campo ainda não montou (ex.: deslogado, ou `myAnime` ainda
  // carregando) — o CTA de login/carregando não tem nada pra focar mesmo.
  useEffect(() => {
    if (quoting) composerBodyRef.current?.focus();
  }, [quoting]);

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
      if ((targetTab === "following" || targetTab === "recent") && cursorArg) params.set("cursor", cursorArg);
      if (targetTab === "recommended") {
        if (offsetArg) params.set("offset", String(offsetArg));
        if (sinceArg) params.set("since", sinceArg);
      }
      const res = await fetch(`/api/posts?${params.toString()}`);
      if (!res.ok) throw new Error("falha ao carregar o feed");
      const data = await res.json();
      // Uma troca de aba pode deixar este fetch "para trás" (ex.: um
      // loadMore da aba antiga ainda em voo quando o usuário já trocou de
      // aba) — sem essa guarda, a resposta tardia mistura posts de uma
      // aba na state da outra e corrompe a paginação dela.
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

  // Mesmo raciocínio de handleLikeChange acima, agora pro último campo
  // "por post" que ainda vivia em estado local do PostCard (achado real
  // da 20ª rodada de auditoria, Epic 18): denunciar numa instância não
  // refletia "Denunciado" na outra instância do mesmo post.
  const handleReportChange = useCallback((postId: string, reported: boolean) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reportedByMe: reported } : p)));
  }, []);

  function handleQuote(post: PostDTO) {
    setQuoting({ id: post.id, author: post.author.displayName, snippet: post.body.slice(0, 80) });
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setComposerBody(e.target.value.slice(0, MAX_BODY_LENGTH));
  }

  // Sobe UMA imagem e atualiza só a entrada dela por localId quando
  // terminar — chamada em paralelo pra cada arquivo recém-anexado (ver
  // handleAddImages) e de novo por handleRetryImage, então precisa ser
  // segura de rodar mais de uma vez em paralelo sem interferir nas outras
  // entradas.
  function startImageUpload(entry: ComposerImage) {
    uploadImage(entry.file)
      .then((data) => {
        setComposerImages((prev) =>
          prev.map((img) => (img.localId === entry.localId ? { ...img, status: "done", uploadedUrl: data.url } : img))
        );
      })
      .catch((err: Error) => {
        setComposerImages((prev) =>
          prev.map((img) =>
            img.localId === entry.localId ? { ...img, status: "error", error: err.message } : img
          )
        );
      });
  }

  function handleAddImages(files: File[]) {
    const remainingSlots = Math.max(0, MAX_IMAGES - composerImages.length);
    const accepted = files.slice(0, remainingSlots);
    // Sem aviso nenhum antes, selecionar mais arquivos do que o espaço
    // restante descartava o excesso em silêncio — a única pista era a
    // fileira de miniaturas crescer menos do que o esperado (achado real
    // da revisão de código desta entrega).
    if (accepted.length < files.length) {
      const dropped = files.length - accepted.length;
      setError(
        `No máximo ${MAX_IMAGES} imagens por post — ${dropped} ${dropped === 1 ? "não foi anexada" : "não foram anexadas"}.`
      );
    }
    const newEntries: ComposerImage[] = accepted.map((file) => ({
      localId: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "uploading",
    }));
    setComposerImages((prev) => [...prev, ...newEntries]);
    newEntries.forEach(startImageUpload);
  }

  function handleRemoveImage(localId: string) {
    setComposerImages((prev) => {
      const target = prev.find((img) => img.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.localId !== localId);
    });
  }

  function handleRetryImage(localId: string) {
    const entry = composerImages.find((img) => img.localId === localId);
    if (!entry) return;
    setComposerImages((prev) =>
      prev.map((img) => (img.localId === localId ? { ...img, status: "uploading", error: undefined } : img))
    );
    startImageUpload(entry);
  }

  async function handleSubmit() {
    const text = composerBody.trim();
    if (!text) return;
    if (postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError(null);
    try {
      const imageUrls = composerImages
        .filter((img) => img.status === "done")
        .map((img) => img.uploadedUrl as string);
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          imageUrls,
          anilistId: relatedAnime?.anilistId,
          isSpoiler: composerSpoiler,
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
      setComposerSpoiler(false);
      setRelatedAnime(null);
      composerImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setComposerImages([]);
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
      <Box sx={{ mb: 2 }}>
        <CommunitySearchBox />
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Para você" value="recommended" />
        {user && <Tab label="Seguindo" value="following" />}
        <Tab label="Recentes" value="recent" />
      </Tabs>
      {tab === "recommended" && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }} data-testid="for-you-explainer">
          Publicações recentes com mais curtidas. Sem perfil pessoal: a regra é a mesma para todo mundo.
        </Typography>
      )}

      <Box sx={{ mb: 3, pb: 2, borderBottom: 1, borderColor: "divider" }}>
        {loggedOut ? (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Entre pra publicar no feed.
            </Typography>
            <LinkButton href={loginHref(pathname)} variant="contained" size="small">
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
        ) : (
          // Estilo Twitter/X (Epic 26): avatar à esquerda, campo de texto
          // sem borda à direita, barra de ações embaixo (anexar imagem,
          // contador, "Publicar" arredondado). O anime do post não é mais
          // um campo separado — sai de uma hashtag dentro do próprio
          // texto (#NomeDoAnime), com sugestão em lista enquanto digita
          // (mentionSuggestions/handleBodyChange/handleSelectMention
          // acima) — pedido direto do usuário, pra ficar mais parecido
          // com hashtag de rede social de verdade.
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            {user && (
              <Avatar sx={{ bgcolor: avatarColor(user.id), width: 44, height: 44, fontSize: 18, fontWeight: 700 }}>
                {initials(user.displayName)}
              </Avatar>
            )}
            <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
              {quoting && (
                // role="status" anuncia a entrada em modo citação pra quem usa
                // leitor de tela — sem isso, só o scroll automático (useEffect
                // logo acima) avisava quem enxerga, e nem esse chegava a mover
                // o foco: teclado/leitor de tela tinham que navegar manualmente
                // até aqui, sem nenhum sinal de que o modo tinha mudado (achado
                // real da 22ª rodada de auditoria, Epic 18).
                <Stack
                  direction="row"
                  spacing={1}
                  role="status"
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
                inputRef={composerBodyRef}
                value={composerBody}
                onChange={handleBodyChange}
                placeholder="Que conversa você quer começar?"
                variant="standard"
                slotProps={{ input: { disableUnderline: true } }}
                multiline
                minRows={2}
                maxRows={8}
                sx={{ "& .MuiInputBase-input": { fontSize: "1.25rem", lineHeight: 1.4 } }}
              />

              <AnimeContextPicker value={relatedAnime} onChange={setRelatedAnime} disabled={posting} />

              <ComposerImageAttachments
                images={composerImages}
                onRemove={handleRemoveImage}
                onRetry={handleRetryImage}
              />

              <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between", pt: 1, borderTop: 1, borderColor: "divider" }}
              >
                <Tooltip title={composerImages.length >= MAX_IMAGES ? `Máximo de ${MAX_IMAGES} imagens` : "Anexar imagem"}>
                  <span>
                    <IconButton component="label" color="primary" disabled={composerImages.length >= MAX_IMAGES} aria-label="Anexar imagem">
                      <ImageOutlinedIcon />
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (files.length) handleAddImages(files);
                        }}
                      />
                    </IconButton>
                  </span>
                </Tooltip>

                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={composerSpoiler}
                      onChange={(e) => setComposerSpoiler(e.target.checked)}
                    />
                  }
                  label="Contém spoilers"
                  slotProps={{ typography: { variant: "caption" } }}
                />

                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                  <Typography
                    variant="caption"
                    sx={{ color: composerBody.length >= MAX_BODY_LENGTH ? "error.main" : "text.secondary" }}
                  >
                    {composerBody.length}/{MAX_BODY_LENGTH}
                  </Typography>
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      posting ||
                      !composerBody.trim() ||
                      composerImages.some((img) => img.status === "uploading")
                    }
                    variant="contained"
                    sx={{ borderRadius: 999, px: 3, textTransform: "none", fontWeight: 700 }}
                  >
                    Publicar
                  </Button>
                </Stack>
              </Stack>
            </Stack>
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
      ) : loadFailed && posts.length === 0 ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => resetAndLoad(tab)}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar o feed. Isso não quer dizer que ele está vazio.
        </Alert>
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
      )}
    </Box>
  );
}
