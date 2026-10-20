"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FlagIcon from "@mui/icons-material/Flag";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string };
  isMine: boolean;
  reportedByMe: boolean;
};

// Mesmo limite de src/app/api/anime/[id]/comments/route.ts — sem eco no
// cliente, digitar um comentário longo só dava algum retorno depois de
// clicar "Comentar" e receber "Comentário muito longo" (achado real da 8ª
// rodada de auditoria, Epic 18); mesmo padrão já usado no compositor do
// Feed (FeedView.tsx).
const MAX_BODY_LENGTH = 2000;
// Ponto de corte do "ver mais" — comentário mais longo que isso mostra
// truncado com botão pra expandir, só no cliente (não muda o que a API
// devolve).
const LONG_COMMENT_THRESHOLD = 300;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Thread de comentários por anime (Epic 15) — não um feed global, ver
 * roadmap. Comentar exige ter esse anime na própria lista, mesma regra de
 * quem pode ver a página de detalhe; a API já garante isso, aqui só
 * consome. A rota devolve 10 por página; a tela as acrescenta ao fim da lista
 * conforme a pessoa desce (rolagem infinita).
 */
export function CommentSection({
  animeId,
  accentColor,
}: {
  animeId: string;
  /** Cor de destaque do anime — usada no botão "Comentar" e na paginação. */
  accentColor?: string | null;
}) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  // Quantas páginas (de 10) já estão na lista e quantas existem; a próxima vem ao chegar perto do fim.
  const [loadedPages, setLoadedPages] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadingMoreRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Guarda síncrona pra clique duplo/triplo rápido em "Comentar" — o
  // `disabled={posting}` do botão só reflete depois do próximo render, e
  // um clique real (não sintético) pode disparar de novo antes disso,
  // criando comentários duplicados (achado real da 5ª rodada de
  // auditoria, Epic 18).
  const postingRef = useRef(false);
  // Sequencia as respostas de loadPage — sem isso, clicar rápido na
  // paginação (ou clicar numa página enquanto handlePost ainda está
  // pulando pra última) pode deixar uma resposta mais velha, que chega
  // depois de uma mais nova, sobrescrever o estado com uma página errada
  // (achado real da revisão de código deste lote).
  const requestSeqRef = useRef(0);

  const fetchPage = useCallback(
    async (target: number) => {
      const res = await fetch(`/api/anime/${animeId}/comments?page=${target}`);
      if (!res.ok) throw new Error("falha");
      return (await res.json()) as { comments?: CommentItem[]; totalPages?: number; page?: number };
    },
    [animeId]
  );

  /**
   * Refaz, na ordem, as páginas que já estavam na lista (depois de comentar ou apagar): quem comenta vê o comentário novo
   * no fim, e quem apaga não perde o lugar onde estava. Respostas atrasadas de uma chamada anterior são descartadas.
   */
  const reloadLoaded = useCallback(
    async (upTo: number) => {
      const seq = ++requestSeqRef.current;
      let all: CommentItem[] = [];
      let total = 1;
      let last = 0;
      for (let p = 1; p <= Math.max(1, upTo); p += 1) {
        const data = await fetchPage(p);
        total = data.totalPages ?? 1;
        all = [...all, ...(data.comments ?? [])];
        last = p;
        if (p >= total) break;
      }
      if (seq === requestSeqRef.current) {
        setComments(all);
        setTotalPages(total);
        setLoadedPages(last);
      }
    },
    [fetchPage]
  );

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || loadedPages >= totalPages) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadFailed(false);
    const seq = ++requestSeqRef.current;
    fetchPage(loadedPages + 1)
      .then((data) => {
        if (seq !== requestSeqRef.current) return;
        setComments((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...(data.comments ?? []).filter((c) => !seen.has(c.id))];
        });
        setTotalPages(data.totalPages ?? 1);
        setLoadedPages(data.page ?? loadedPages + 1);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [fetchPage, loadedPages, totalPages]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/anime/${animeId}/comments?page=1`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments ?? []);
        setTotalPages(data.totalPages ?? 1);
        setLoadedPages(data.page ?? 1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [animeId]);

  async function handlePost() {
    const text = draft.trim();
    if (!text) return;
    if (postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${animeId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao comentar");
        return;
      }
      setDraft("");
      // Carrega até a última página — o comentário recém-postado fica no fim da lista; sem isso "Comentar" parecia não
      // ter feito nada quando as últimas páginas ainda não estavam na tela.
      await reloadLoaded(data.totalPages ?? loadedPages);
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao apagar comentário");
        return;
      }
      await reloadLoaded(loadedPages);
    } catch {
      setError("Falha ao apagar comentário");
    }
  }

  async function handleReport(id: string) {
    setError(null);
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, reportedByMe: true } : c)));
    try {
      const res = await fetch(`/api/comments/${id}/report`, { method: "POST" });
      if (!res.ok) {
        setComments((prev) => prev.map((c) => (c.id === id ? { ...c, reportedByMe: false } : c)));
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao denunciar comentário");
      }
    } catch {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, reportedByMe: false } : c)));
      setError("Falha ao denunciar comentário");
    }
  }

  const { ref: sentinelRef, supported: infiniteSupported } = useInfiniteScroll(loadMore, loadedPages < totalPages && !loading && !loadFailed, comments.length);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 3, alignItems: "flex-start" }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY_LENGTH))}
          placeholder="Escreva um comentário..."
          helperText={`${draft.length}/${MAX_BODY_LENGTH}`}
          size="small"
          fullWidth
          multiline
          maxRows={4}
        />
        <Button
          onClick={handlePost}
          disabled={posting || !draft.trim()}
          variant="contained"
          sx={accentColor ? { bgcolor: accentColor, color: "#0b0b0d", "&:hover": { bgcolor: accentColor } } : undefined}
        >
          Comentar
        </Button>
      </Stack>

      {loading ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Carregando comentários...
        </Typography>
      ) : comments.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Nenhum comentário ainda. Seja o primeiro.
        </Typography>
      ) : (
        <Stack spacing={2}>
          {comments.map((c) => {
            const isLong = c.body.length > LONG_COMMENT_THRESHOLD;
            const isExpanded = expanded.has(c.id);
            const shownBody = isLong && !isExpanded ? `${c.body.slice(0, LONG_COMMENT_THRESHOLD)}…` : c.body;
            return (
              <Box
                key={c.id}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  borderLeft: 2,
                  borderColor: "divider",
                  pl: 1.5,
                  py: 0.5,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {c.author.displayName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {fmtDate(c.createdAt)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", color: "text.secondary" }}>
                    {shownBody}
                  </Typography>
                  {isLong && (
                    <Button
                      onClick={() => toggleExpanded(c.id)}
                      size="small"
                      sx={{ px: 0, minWidth: 0, textTransform: "none" }}
                    >
                      {isExpanded ? "ver menos" : "ver mais"}
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
                  <Tooltip title={c.reportedByMe ? "Denunciado" : "Denunciar comentário"}>
                    <span>
                      <IconButton
                        onClick={() => handleReport(c.id)}
                        disabled={c.reportedByMe}
                        size="small"
                        aria-label={c.reportedByMe ? "Denunciado" : "Denunciar comentário"}
                      >
                        <FlagIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      <InfiniteFooter
        testId="comments"
        sentinelRef={sentinelRef}
        supported={infiniteSupported}
        hasMore={loadedPages < totalPages}
        loadingMore={loadingMore}
        failed={loadFailed}
        onMore={loadMore}
        onRetry={loadMore}
        loadingLabel="Carregando mais comentários…"
        moreLabel="Ver mais comentários"
      />
    </Box>
  );
}
