"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { loginHref } from "@/lib/safeRedirect";
import NextLink from "next/link";
import DeleteIcon from "@mui/icons-material/Delete";
import SendIcon from "@mui/icons-material/Send";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Link as MuiLink,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { SpoilerGate } from "@/components/SpoilerGate";
import { ReportDialog } from "@/components/ReportDialog";
import FlagIcon from "@mui/icons-material/Flag";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { formatRelativeTime } from "@/lib/relativeTime";

type CommentItem = {
  id: string;
  parentId?: string | null;
  replyTo?: { id: string; displayName: string } | null;
  body: string;
  isSpoiler?: boolean;
  createdAt: string;
  author: { id: string; displayName: string };
  isMine: boolean;
};

// Mesmo limite do backend (src/app/api/posts/[postId]/comments/route.ts) —
// mesmo padrão de eco no cliente já usado em CommentSection.tsx.
const MAX_BODY_LENGTH = 2000;

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
}: {
  postId: string;
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
  // CommentSection.tsx/FeedView.tsx — disabled={posting} só reflete no
  // próximo render.
  const postingRef = useRef(false);

  // Destino de notificação com âncora (#comentario-<id>): depois que a
  // lista carrega, leva a resposta exata para a tela.
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#comentario-")) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [loading]);

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

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
      {error && (
        <Typography variant="caption" sx={{ color: "error.main", display: "block", mb: 1 }}>
          {error}
        </Typography>
      )}

      {loading ? (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Carregando comentários...
        </Typography>
      ) : comments.length === 0 ? (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Nenhum comentário ainda. Seja o primeiro.
        </Typography>
      ) : (
        <Stack spacing={1.25} sx={{ mb: 1.5 }}>
          {threadOrder(comments).map((c) => (
            <Stack
              key={c.id}
              id={`comentario-${c.id}`}
              data-testid={`comment-${c.id}`}
              direction="row"
              spacing={1}
              sx={{
                alignItems: "flex-start",
                justifyContent: "space-between",
                ...(c.parentId && comments.some((p) => p.id === c.parentId)
                  ? { ml: 3, pl: 1.5, borderLeft: 2, borderColor: "divider" }
                  : {}),
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                  <MuiLink
                    component={NextLink}
                    href={`/users/${c.author.id}`}
                    underline="hover"
                    sx={{ fontWeight: 700, fontSize: 13, color: "text.primary" }}
                  >
                    {c.author.displayName}
                  </MuiLink>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {formatRelativeTime(c.createdAt)}
                  </Typography>
                </Stack>
                {c.replyTo && (
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Em resposta a {c.replyTo.displayName}
                  </Typography>
                )}
                {c.isSpoiler ? (
                  <SpoilerGate<{ body: string }>
                    revealUrl={`/api/posts/${postId}/comments/${c.id}/reveal`}
                    render={(d) => (
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {d.body}
                      </Typography>
                    )}
                  />
                ) : (
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {c.body}
                  </Typography>
                )}
                {!loggedOut && (
                  <Button
                    onClick={() => setReplyingTo(c)}
                    size="small"
                    sx={{ px: 0, minWidth: 0, textTransform: "none", fontSize: 12 }}
                    aria-label={`Responder a ${c.author.displayName}`}
                  >
                    Responder
                  </Button>
                )}
              </Box>
              {c.isMine ? (
                <Tooltip title="Apagar comentário">
                  <IconButton onClick={() => handleDelete(c.id)} size="small" aria-label="Apagar comentário">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                !loggedOut && (
                  <Tooltip title={reportedIds.has(c.id) ? "Denunciado" : "Denunciar comentário"}>
                    <span>
                      <IconButton
                        onClick={() => setReportingId(c.id)}
                        disabled={reportedIds.has(c.id)}
                        size="small"
                        aria-label={reportedIds.has(c.id) ? "Comentário denunciado" : "Denunciar comentário"}
                      >
                        <FlagIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )
              )}
            </Stack>
          ))}
        </Stack>
      )}

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
        <MuiLink component={NextLink} href={loginHref(pathname)} underline="hover" sx={{ fontSize: 13 }}>
          Entre para comentar
        </MuiLink>
      ) : (
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          {replyingTo && (
            <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }} role="status" data-testid="replying-to">
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Em resposta a {replyingTo.author.displayName} · comentário
              </Typography>
              <Button size="small" onClick={() => setReplyingTo(null)} sx={{ textTransform: "none", minWidth: 0 }}>
                Cancelar resposta
              </Button>
            </Box>
          )}
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY_LENGTH))}
            placeholder="Escreva um comentário..."
            size="small"
            fullWidth
            multiline
            maxRows={4}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={draftSpoiler} onChange={(e) => setDraftSpoiler(e.target.checked)} />}
            label="Contém spoilers"
            slotProps={{ typography: { variant: "caption" } }}
          />
          <Tooltip title="Comentar">
            <span>
              <IconButton
                onClick={handlePost}
                disabled={posting || !draft.trim()}
                aria-label="Comentar"
                color="primary"
                size="small"
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
}
