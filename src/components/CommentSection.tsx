"use client";

import { useEffect, useRef, useState } from "react";
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

function byCreatedAt(a: CommentItem, b: CommentItem): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

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
 * consome.
 */
export function CommentSection({ animeId }: { animeId: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guarda síncrona pra clique duplo/triplo rápido em "Comentar" — o
  // `disabled={posting}` do botão só reflete depois do próximo render, e
  // um clique real (não sintético) pode disparar de novo antes disso,
  // criando comentários duplicados (achado real da 5ª rodada de
  // auditoria, Epic 18).
  const postingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/anime/${animeId}/comments`)
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
      setComments((prev) => [...prev, data.comment]);
      setDraft("");
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
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        // Rollback — sem isso o comentário sumia da tela mesmo quando o
        // apagar falhou de verdade no servidor, sem nenhum aviso.
        if (removed) setComments((prev) => [...prev, removed].sort(byCreatedAt));
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao apagar comentário");
      }
    } catch {
      if (removed) setComments((prev) => [...prev, removed].sort(byCreatedAt));
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
        <Button onClick={handlePost} disabled={posting || !draft.trim()} variant="contained">
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
          {comments.map((c) => (
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
                  {c.body}
                </Typography>
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
          ))}
        </Stack>
      )}
    </Box>
  );
}
