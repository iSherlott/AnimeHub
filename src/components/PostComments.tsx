"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { loginHref } from "@/lib/safeRedirect";
import NextLink from "next/link";
import {
  Box,
  Button,
  ButtonBase,
  Checkbox,
  InputBase,
  Link as MuiLink,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { UserAvatar } from "@/components/UserAvatar";
import { AchievementTitleBadge } from "@/components/AchievementTitleBadge";
import { SpoilerGate } from "@/components/SpoilerGate";
import { ReportDialog } from "@/components/ReportDialog";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useWindowedList } from "@/lib/useWindowedList";

type CommentItem = {
  id: string;
  parentId?: string | null;
  replyTo?: { id: string; displayName: string } | null;
  body: string;
  isSpoiler?: boolean;
  createdAt: string;
  author: { id: string; displayName: string; handle?: string | null; avatarUrl?: string | null; title?: string | null };
  isMine: boolean;
};

// Mesmo limite do backend (src/app/api/posts/[postId]/comments/route.ts),
// repetido no cliente para o contador e o campo.
const MAX_BODY_LENGTH = 2000;
// Respostas que aparecem de cada vez (o resto vem ao rolar a conversa).
const COMMENT_WINDOW = 20;

/** Respostas de topo em ordem cronológica, cada uma seguida das suas filhas (um nível). */
function threadOrder(comments: CommentItem[]): CommentItem[] {
  const ids = new Set(comments.map((c) => c.id));
  const isChild = (c: CommentItem) => Boolean(c.parentId && ids.has(c.parentId));
  const tops = comments.filter((c) => !isChild(c));
  const out: CommentItem[] = [];
  for (const top of tops) {
    out.push(top);
    out.push(...comments.filter((c) => c.parentId === top.id));
  }
  return out;
}

function byCreatedAt(a: CommentItem, b: CommentItem): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/**
 * Thread de comentário por post (Epic 24), aberta inline no PostCard ao
 * clicar no ícone de comentário — não uma página à parte, pra manter o
 * feed contínuo estilo Instagram/Twitter. Leitura pública; comentar
 * exige login (a API já garante isso, aqui só mostra o CTA).
 */
export function PostComments({
  postId,
  commentCount,
  onCountChange,
  withHeading = false,
}: {
  postId: string;
  /** Página de discussão: mostra "Respostas · Ordem da conversa" acima da lista. */
  withHeading?: boolean;
  /** Contagem "oficial" do post, levantada até FeedView/UserPostList —
   * usada só pra notar quando ela muda por uma ação de OUTRA instância
   * desta mesma thread (o mesmo post pode aparecer 2x na página — ele
   * mesmo + "Fulano repostou" — com a thread aberta nos 2 ao mesmo
   * tempo) e então recarregar a lista de verdade. Ver o efeito abaixo. */
  commentCount: number;
  /** Contagem ABSOLUTA atual (não um delta) — ver comentário no efeito de
   * carregamento abaixo sobre por que isso importa. */
  onCountChange: (count: number) => void;
}) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const loggedOut = user === null;
  const [draftSpoiler, setDraftSpoiler] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mesma guarda síncrona contra clique duplo/triplo já usada em
  // FeedView.tsx — disabled={posting} só reflete no próximo render.
  const postingRef = useRef(false);

  // Rolagem infinita: conversas longas aparecem aos poucos, na ordem da conversa.
  const ordered = useMemo(() => threadOrder(comments), [comments]);
  const windowed = useWindowedList(ordered, postId, COMMENT_WINDOW);
  const { ref: sentinelRef, supported: infiniteSupported } = useInfiniteScroll(windowed.loadMore, windowed.hasMore, windowed.shown);

  // Destino de notificação com âncora (#comentario-<id>): depois que a lista carrega, leva a resposta exata para a tela
  // (abrindo antes a parte da conversa em que ela está, se ainda não estiver à mostra).
  const anchoredRef = useRef(false);
  useEffect(() => {
    if (loading || anchoredRef.current) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#comentario-")) {
      anchoredRef.current = true;
      return;
    }
    const index = ordered.findIndex((c) => `comentario-${c.id}` === hash.slice(1));
    if (index >= windowed.shown) {
      windowed.expandTo(index + 1); // o efeito roda de novo com a resposta já na tela
      return;
    }
    anchoredRef.current = true;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ordered, windowed.shown]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/posts/${postId}/comments`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setComments(data.comments ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // Sincroniza o contador do PostCard com a lista REAL sempre que ela
  // muda de verdade (carregamento inicial, criar, apagar, ou desfazer um
  // apagar que falhou) — nunca lendo `comments` direto dentro dos
  // handlers abaixo, que ficaria preso a um closure antigo se 2 mudanças
  // de estado terminarem fora de ordem (ex.: o GET inicial ainda em voo
  // quando um "Comentar" já digitado é clicado) — um handler async
  // comum não é notificado de mudanças de estado que aconteçam enquanto
  // ele está em andamento. Um efeito, ao contrário, sempre roda depois
  // do estado já estar committado, então nunca fica desatualizado dessa
  // forma. `loading` evita reportar 0 no instante entre montar e o 1º
  // fetch responder, sobrescrevendo por um instante a contagem certa que
  // já veio do feed (achado real da 17ª rodada de auditoria, Epic 18 —
  // o badge só andava por delta ±1 das próprias ações do viewer e nunca
  // se corrigia contra a contagem real quando outra pessoa comentava/
  // apagava enquanto a thread estava fechada).
  useEffect(() => {
    if (loading) return;
    onCountChange(comments.length);
  }, [comments, loading, onCountChange]);

  // A contagem sobe pro pai (efeito acima), mas isso corrige só o BADGE —
  // achado real da 20ª rodada de auditoria (Epic 18): com a mesma thread
  // aberta em 2 instâncias do mesmo post ao mesmo tempo, comentar numa
  // atualizava a contagem nas 2 (correção da 17ª/18ª rodada, ainda
  // válida) mas a LISTA de comentários da outra instância nunca sabia da
  // novidade — badge e lista contradiziam um ao outro até recarregar.
  // `commentCount` (prop levantada) muda quando QUALQUER instância da
  // mesma thread posta/apaga; se ele não bate mais com o tamanho da
  // lista LOCAL, é porque a mudança veio de outro lugar — recarrega a
  // lista de verdade pra alcançar. `comments.length` é lido de propósito
  // sem entrar nas dependências: numa ação própria, o estado local já
  // muda primeiro (nesta mesma instância), então quando `commentCount`
  // finalmente volta atualizado do pai os dois já batem e nenhum fetch
  // extra acontece — só uma mudança vinda de fora deixa os dois
  // diferentes na hora em que este efeito roda.
  useEffect(() => {
    if (loading) return;
    if (commentCount === comments.length) return;
    let cancelled = false;
    fetch(`/api/posts/${postId}/comments`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setComments(data.comments ?? []);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `comments.length` lido de propósito sem virar dependência, ver comentário acima
  }, [commentCount, loading, postId]);

  async function handlePost() {
    const text = draft.trim();
    if (!text) return;
    if (postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, isSpoiler: draftSpoiler, parentId: replyingTo?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao comentar");
        return;
      }
      setComments((prev) => [...prev, data.comment]);
      setDraft("");
      setDraftSpoiler(false);
      setReplyingTo(null);
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    const removed = comments.find((c) => c.id === id);
    setError(null);
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        if (removed) setComments((prev) => [...prev, removed].sort(byCreatedAt));
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao apagar comentário");
      }
    } catch {
      if (removed) setComments((prev) => [...prev, removed].sort(byCreatedAt));
      setError("Falha ao apagar comentário");
    }
  }

  const [moreFor, setMoreFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  async function copyCommentLink(id: string) {
    setMoreFor(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/publicacao/${postId}#comentario-${id}`);
    } catch {
      setError("Não foi possível copiar o link");
    }
  }

  const actionSx = { fontSize: 12, color: "text.secondary", minHeight: 36, borderRadius: "6px", px: 0.5 } as const;

  return (
    <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 3 }}>
      {error && (
        <Typography role="alert" sx={{ color: "error.main", fontSize: 12 }}>
          {error}
        </Typography>
      )}

      {withHeading && (
        <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
            Respostas
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Ordem da conversa · {comments.length} {comments.length === 1 ? "resposta" : "respostas"}
          </Typography>
        </Stack>
      )}

      {loading ? (
        <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Carregando comentários...</Typography>
      ) : comments.length === 0 ? (
        <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Nenhum comentário ainda. Seja o primeiro.</Typography>
      ) : (
        <Stack spacing={3}>
          {windowed.visible.map((c) => {
            const nested = Boolean(c.parentId && comments.some((p) => p.id === c.parentId));
            return (
              <Box
                key={c.id}
                id={`comentario-${c.id}`}
                data-testid={`comment-${c.id}`}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  scrollMarginTop: 120,
                  ...(nested ? { ml: 3, pl: 3, borderLeft: 1, borderColor: "divider" } : {}),
                }}
              >
                {c.replyTo && (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Em resposta a {c.replyTo.displayName}</Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                  <UserAvatar id={c.author.id} displayName={c.author.displayName} avatarUrl={c.author.avatarUrl} size={28} />
                  <MuiLink component={NextLink} href={`/users/${c.author.id}`} underline="hover" sx={{ fontWeight: 700, fontSize: 12, color: "text.primary", whiteSpace: "nowrap" }}>
                    {c.author.displayName}
                  </MuiLink>
                  <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
                    {c.author.handle ? `@${c.author.handle} · ` : ""}
                    {formatRelativeTime(c.createdAt)}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <ButtonBase
                    onClick={(e) => setMoreFor({ id: c.id, anchor: e.currentTarget })}
                    aria-label="Mais opções da resposta"
                    sx={{ minWidth: 44, minHeight: 44, borderRadius: "6px", fontSize: 14, fontWeight: 700, color: "text.secondary" }}
                  >
                    ···
                  </ButtonBase>
                </Stack>
                {c.author.title && (
                  <Box sx={{ pl: "36px" }}>
                    <AchievementTitleBadge title={c.author.title} />
                  </Box>
                )}
                {c.isSpoiler ? (
                  <SpoilerGate<{ body: string }>
                    revealUrl={`/api/posts/${postId}/comments/${c.id}/reveal`}
                    render={(d) => <Typography sx={{ whiteSpace: "pre-wrap", fontSize: 16 }}>{d.body}</Typography>}
                  />
                ) : (
                  <Typography sx={{ whiteSpace: "pre-wrap", fontSize: 16, overflowWrap: "anywhere" }}>{c.body}</Typography>
                )}
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                  {!loggedOut && (
                    <ButtonBase onClick={() => setReplyingTo(c)} aria-label={`Responder a ${c.author.displayName}`} sx={actionSx}>
                      Responder
                    </ButtonBase>
                  )}
                  {c.isMine ? (
                    <ButtonBase onClick={() => handleDelete(c.id)} aria-label="Apagar comentário" sx={actionSx}>
                      Excluir resposta
                    </ButtonBase>
                  ) : (
                    !loggedOut && (
                      <ButtonBase
                        onClick={() => setReportingId(c.id)}
                        disabled={reportedIds.has(c.id)}
                        aria-label={reportedIds.has(c.id) ? "Comentário denunciado" : "Denunciar comentário"}
                        sx={actionSx}
                      >
                        {reportedIds.has(c.id) ? "Denunciado" : "Denunciar comentário"}
                      </ButtonBase>
                    )
                  )}
                </Stack>
              </Box>
            );
          })}
          <InfiniteFooter
            testId="post-comments"
            sentinelRef={sentinelRef}
            supported={infiniteSupported}
            hasMore={windowed.hasMore}
            loadingMore={false}
            failed={false}
            onMore={windowed.loadMore}
            onRetry={windowed.loadMore}
            moreLabel="Ver mais respostas"
          />
        </Stack>
      )}

      <Menu anchorEl={moreFor?.anchor ?? null} open={Boolean(moreFor)} onClose={() => setMoreFor(null)}>
        <MenuItem onClick={() => moreFor && copyCommentLink(moreFor.id)}>Copiar link da resposta</MenuItem>
      </Menu>

      {reportingId && (
        <ReportDialog
          open
          onClose={() => setReportingId(null)}
          target={{ kind: "comment", id: reportingId, postId }}
          targetLabel="este comentário"
          onReported={() => setReportedIds((prev) => new Set(prev).add(reportingId))}
        />
      )}

      {loggedOut ? (
        <MuiLink component={NextLink} href={loginHref(pathname)} underline="hover" sx={{ fontSize: 14 }}>
          Entre para comentar
        </MuiLink>
      ) : (
        <Box sx={{ bgcolor: "background.paper", borderRadius: "12px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography
            role={replyingTo ? "status" : undefined}
            data-testid={replyingTo ? "replying-to" : undefined}
            sx={{ fontWeight: 700, fontSize: 14 }}
          >
            {replyingTo ? `Em resposta a ${replyingTo.author.displayName} · comentário` : "Sua resposta"}
          </Typography>
          <Box sx={{ bgcolor: "background.default", borderRadius: "10px", p: 2, minHeight: 80 }}>
            <InputBase
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY_LENGTH))}
              placeholder="Escreva uma resposta..."
              multiline
              minRows={2}
              maxRows={8}
              fullWidth
              inputProps={{ "aria-label": "Escreva uma resposta" }}
              sx={{ fontSize: 16, p: 0, alignItems: "flex-start" }}
            />
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Checkbox
              id={`spoiler-${postId}`}
              checked={draftSpoiler}
              onChange={(e) => setDraftSpoiler(e.target.checked)}
              sx={{ p: 0.5, color: "text.secondary" }}
            />
            <Typography component="label" htmlFor={`spoiler-${postId}`} sx={{ fontSize: 12, color: "text.secondary" }}>
              Contém spoilers · desmarcado por padrão
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Button
              onClick={() => {
                setReplyingTo(null);
                setDraft("");
                setDraftSpoiler(false);
              }}
              disabled={!replyingTo && !draft}
              sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}
            >
              Cancelar resposta
            </Button>
            <Button onClick={handlePost} disabled={posting || !draft.trim()} variant="contained">
              Enviar resposta
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
