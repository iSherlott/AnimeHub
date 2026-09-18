"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FlagIcon from "@mui/icons-material/Flag";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Pagination,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; completed: boolean };
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
 * consome. Paginada (10 por página, lote 1 do Epic 27) — a rota devolve
 * sempre a página inteira, não acumula em memória no cliente.
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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

  // Não mexe em `loading` — só usada pro carregamento inicial (efeito
  // abaixo), que já parte de `loading: true`. Chamar setState síncrono no
  // corpo de um efeito (antes do 1º `await`) dispara o lint
  // react-hooks/set-state-in-effect; nas trocas de página/pós-postar essa
  // função é chamada de dentro de handlers de clique, não de um efeito, e
  // nunca mostrou indicador de carregamento mesmo antes desta rodada.
  const loadPage = useCallback(
    async (targetPage: number) => {
      const seq = ++requestSeqRef.current;
      const res = await fetch(`/api/anime/${animeId}/comments?page=${targetPage}`);
      const data = await res.json();
      if (seq === requestSeqRef.current) {
        setComments(data.comments ?? []);
        setTotalPages(data.totalPages ?? 1);
        setPage(data.page ?? targetPage);
      }
      return data;
    },
    [animeId]
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/anime/${animeId}/comments?page=1`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments ?? []);
        setTotalPages(data.totalPages ?? 1);
        setPage(data.page ?? 1);
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
      // Pula pra última página — senão o comentário recém-postado some pra
      // quem estava vendo uma página anterior (achado deste lote: sem
      // isso, "Comentar" parecia não ter feito nada quando não se estava
      // já na última página).
      await loadPage(data.totalPages ?? page);
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
      const data = await loadPage(page);
      // Página atual ficou vazia (era o único comentário dela) e não é a
      // 1ª — volta pra anterior em vez de mostrar uma página em branco.
      if ((data.comments ?? []).length === 0 && page > 1) {
        await loadPage(page - 1);
      }
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
                    {c.author.completed && (
                      <Tooltip title="Já assistiu esse anime">
                        <CheckCircleIcon
                          role="img"
                          aria-label="Já assistiu esse anime"
                          sx={{ fontSize: 14, color: accentColor ?? "success.main" }}
                        />
                      </Tooltip>
                    )}
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

      {totalPages > 1 && (
        <Pagination
          page={page}
          count={totalPages}
          onChange={(_, value) => loadPage(value)}
          size="small"
          sx={{ mt: 2, "& .Mui-selected": accentColor ? { bgcolor: `${accentColor} !important`, color: "#0b0b0d" } : undefined }}
        />
      )}
    </Box>
  );
}
