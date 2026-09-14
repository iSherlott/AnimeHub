"use client";

import { useEffect, useState } from "react";
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
};

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
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

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
      setPosting(false);
    }
  }

  async function handleDelete(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      await fetch(`/api/comments/${id}`, { method: "DELETE" });
    } catch {
      // sem rollback visual — na pior das hipóteses reaparece no próximo
      // carregamento da página, quando o servidor volta a ser a fonte real.
    }
  }

  async function handleReport(id: string) {
    setReportedIds((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/comments/${id}/report`, { method: "POST" });
    } catch {
      // idem — o botão já reflete "denunciado" otimisticamente.
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
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva um comentário..."
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
                <Tooltip title={reportedIds.has(c.id) ? "Denunciado" : "Denunciar comentário"}>
                  <span>
                    <IconButton
                      onClick={() => handleReport(c.id)}
                      disabled={reportedIds.has(c.id)}
                      size="small"
                      aria-label={reportedIds.has(c.id) ? "Denunciado" : "Denunciar comentário"}
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
