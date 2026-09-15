"use client";

import { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import DeleteIcon from "@mui/icons-material/Delete";
import SendIcon from "@mui/icons-material/Send";
import {
  Box,
  IconButton,
  Link as MuiLink,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { formatRelativeTime } from "@/lib/relativeTime";

type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string };
  isMine: boolean;
};

// Mesmo limite do backend (src/app/api/posts/[postId]/comments/route.ts) —
// mesmo padrão de eco no cliente já usado em CommentSection.tsx.
const MAX_BODY_LENGTH = 2000;

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
  onCountChange,
}: {
  postId: string;
  onCountChange: (delta: number) => void;
}) {
  const user = useCurrentUser();
  const loggedOut = user === null;
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mesma guarda síncrona contra clique duplo/triplo já usada em
  // CommentSection.tsx/FeedView.tsx — disabled={posting} só reflete no
  // próximo render.
  const postingRef = useRef(false);

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
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao comentar");
        return;
      }
      setComments((prev) => [...prev, data.comment]);
      onCountChange(1);
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
    onCountChange(-1);
    try {
      const res = await fetch(`/api/posts/${postId}/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        if (removed) setComments((prev) => [...prev, removed].sort(byCreatedAt));
        onCountChange(1);
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao apagar comentário");
      }
    } catch {
      if (removed) setComments((prev) => [...prev, removed].sort(byCreatedAt));
      onCountChange(1);
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
          {comments.map((c) => (
            <Stack key={c.id} direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
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
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {c.body}
                </Typography>
              </Box>
              {c.isMine && (
                <Tooltip title="Apagar comentário">
                  <IconButton onClick={() => handleDelete(c.id)} size="small" aria-label="Apagar comentário">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ))}
        </Stack>
      )}

      {loggedOut ? (
        <MuiLink component={NextLink} href="/login" underline="hover" sx={{ fontSize: 13 }}>
          Entre para comentar
        </MuiLink>
      ) : (
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY_LENGTH))}
            placeholder="Escreva um comentário..."
            size="small"
            fullWidth
            multiline
            maxRows={4}
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
