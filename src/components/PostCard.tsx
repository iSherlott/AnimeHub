"use client";

import { useState } from "react";
import Image from "next/image";
import DeleteIcon from "@mui/icons-material/Delete";
import FlagIcon from "@mui/icons-material/Flag";
import NextLink from "next/link";
import { Box, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";
import { LikeToggle } from "@/components/LikeToggle";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { PostDTO } from "@/lib/postDto";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PostCard({
  post,
  onDeleted,
}: {
  post: PostDTO;
  onDeleted: (id: string) => void;
}) {
  const user = useCurrentUser();
  const loggedOut = user === null;
  const [reportedByMe, setReportedByMe] = useState(post.reportedByMe);
  const [imageBroken, setImageBroken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted(post.id);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao apagar post");
      }
    } catch {
      setError("Falha ao apagar post");
    }
  }

  async function handleReport() {
    setReportedByMe(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/report`, { method: "POST" });
      if (!res.ok) {
        setReportedByMe(false);
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao denunciar post");
      }
    } catch {
      setReportedByMe(false);
      setError("Falha ao denunciar post");
    }
  }

  return (
    <Box
      data-testid={`post-card-${post.id}`}
      sx={{ borderBottom: 1, borderColor: "divider", py: 2.5 }}
    >
      <Stack direction="row" spacing={1.5}>
        <Box
          sx={{
            position: "relative",
            width: 48,
            height: 64,
            flexShrink: 0,
            borderRadius: 1,
            overflow: "hidden",
            bgcolor: "background.paper",
          }}
        >
          {post.animeCoverImage && (
            <Image src={post.animeCoverImage} alt="" fill sizes="48px" style={{ objectFit: "cover" }} />
          )}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                <MuiLink
                  component={NextLink}
                  href={`/users/${post.author.id}`}
                  underline="hover"
                  sx={{ fontWeight: 700, fontSize: 14, color: "text.primary" }}
                >
                  {post.author.displayName}
                </MuiLink>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {fmtDate(post.createdAt)}
                </Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>
                {post.animeTitleRomaji}
              </Typography>
            </Box>

            {post.isMine ? (
              <Tooltip title="Apagar post">
                <IconButton onClick={handleDelete} size="small" aria-label="Apagar post">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip
                title={loggedOut ? "Entre para denunciar" : reportedByMe ? "Denunciado" : "Denunciar post"}
              >
                <span>
                  <IconButton
                    onClick={handleReport}
                    disabled={reportedByMe || loggedOut}
                    size="small"
                    aria-label={reportedByMe ? "Denunciado" : "Denunciar post"}
                  >
                    <FlagIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>

          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
            {post.body}
          </Typography>

          {post.imageUrl && !imageBroken && (
            // Imagem colada pelo autor — URL arbitrária, fora do allowlist
            // do next/image (remotePatterns só cobre AniList/Kitsu), por
            // isso <img> simples em vez de <Image>. onError esconde
            // silenciosamente uma URL inválida/quebrada.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.imageUrl}
              alt=""
              onError={() => setImageBroken(true)}
              style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, marginTop: 8, display: "block" }}
            />
          )}

          <Box sx={{ mt: 0.5 }}>
            <LikeToggle postId={post.id} initialLiked={post.likedByMe} initialLikeCount={post.likeCount} />
          </Box>

          {error && (
            <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 0.5 }}>
              {error}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
