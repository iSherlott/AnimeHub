"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import FlagIcon from "@mui/icons-material/Flag";
import NextLink from "next/link";
import { Avatar, Box, Chip, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";
import { LikeToggle } from "@/components/LikeToggle";
import { PostComments } from "@/components/PostComments";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { formatRelativeTime } from "@/lib/relativeTime";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import type { PostDTO } from "@/lib/postDto";

// Sem infra de upload de avatar (decisão do Epic 22 — nenhum campo de
// imagem no app tem uma hoje, nem User.avatarUrl é usado pra exibir
// nada). Um card estilo Instagram/Twitter ainda pede um círculo de
// identidade no cabeçalho — iniciais sobre uma cor determinística por
// autor cobrem isso sem precisar de infraestrutura nova.
const AVATAR_COLORS = ["#7C4DFF", "#00BFA5", "#FF6D00", "#2979FF", "#D500F9", "#FFAB00", "#F50057"];

function avatarColor(authorId: string): string {
  let hash = 0;
  for (let i = 0; i < authorId.length; i++) hash = (hash * 31 + authorId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function PostCard({
  post,
  onDeleted,
}: {
  post: PostDTO;
  onDeleted: (id: string) => void;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const loggedOut = user === null;
  const { preference } = useTitlePreference();
  // Post só congela romaji/inglês na criação (Epic 22 — sem nativo/
  // português), mas o card ainda ignorava a preferência de idioma por
  // completo, sempre mostrando romaji cru mesmo com "Inglês" selecionado
  // (achado real da 6ª rodada de auditoria, Epic 18).
  const animeTitle = resolveTitleText(preference, {
    titleRomaji: post.animeTitleRomaji,
    titleEnglish: post.animeTitleEnglish,
  });
  const [reportedByMe, setReportedByMe] = useState(post.reportedByMe);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de capa
  // que 404 (achado real da 6ª rodada de auditoria, Epic 18). Campo
  // diferente de `imageBroken` acima, que é só da imagem colada pelo autor.
  const [coverBroken, setCoverBroken] = useState(false);
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
    // Mesmo padrão do LikeToggle: o ícone continua visível pra quem não
    // tem conta, o clique é que leva pro login (Feed público estilo
    // Instagram/Twitter) em vez de ficar `disabled`.
    if (loggedOut) {
      router.push("/login");
      return;
    }
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

  // useCallback pra manter a mesma referência entre renders — o efeito de
  // carregamento do PostComments depende disso pra não refazer o fetch
  // toda vez que o PostCard re-renderiza por outro motivo (imagem
  // quebrada, erro, etc.) enquanto a thread está aberta. Recebe a
  // contagem ABSOLUTA (não mais um delta ±1): antes, o número só andava
  // por cima/baixo das próprias ações do viewer e nunca se corrigia
  // sozinho quando outra pessoa comentava/apagava enquanto a thread
  // estava fechada — o badge ficava desatualizado e cada ação própria
  // seguinte piorava o desvio em vez de corrigir (achado real da 17ª
  // rodada de auditoria, Epic 18).
  const handleCommentCountChange = useCallback((count: number) => {
    setCommentCount(count);
  }, []);

  return (
    <Box
      data-testid={`post-card-${post.id}`}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        p: 2,
        mb: 2,
        bgcolor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Avatar sx={{ bgcolor: avatarColor(post.author.id), width: 40, height: 40, fontSize: 16, fontWeight: 700 }}>
          {initials(post.author.displayName)}
        </Avatar>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap", minWidth: 0 }}>
              <MuiLink
                component={NextLink}
                href={`/users/${post.author.id}`}
                underline="hover"
                sx={{ fontWeight: 700, fontSize: 14, color: "text.primary" }}
              >
                {post.author.displayName}
              </MuiLink>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                · {formatRelativeTime(post.createdAt)}
              </Typography>
            </Stack>

            {post.isMine && (
              <Tooltip title="Apagar post">
                <IconButton onClick={handleDelete} size="small" aria-label="Apagar post">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          <Chip
            size="small"
            variant="outlined"
            avatar={
              post.animeCoverImage && !coverBroken ? (
                <Box sx={{ position: "relative", width: 20, height: 20 }}>
                  <Image
                    src={post.animeCoverImage}
                    alt=""
                    fill
                    sizes="20px"
                    style={{ objectFit: "cover", borderRadius: "50%" }}
                    onError={() => setCoverBroken(true)}
                  />
                </Box>
              ) : undefined
            }
            label={animeTitle}
            sx={{ mt: 0.5, mb: 1, maxWidth: "100%" }}
          />

          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
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

          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 1 }}>
            <LikeToggle postId={post.id} initialLiked={post.likedByMe} initialLikeCount={post.likeCount} />

            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Tooltip title={commentsOpen ? "Fechar comentários" : "Comentários"}>
                <IconButton onClick={() => setCommentsOpen((v) => !v)} size="small" aria-label="Comentários">
                  <ChatBubbleOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 16 }}>
                {commentCount}
              </Typography>
            </Stack>

            {!post.isMine && (
              <Tooltip
                title={loggedOut ? "Entre para denunciar" : reportedByMe ? "Denunciado" : "Denunciar post"}
              >
                <span>
                  <IconButton
                    onClick={handleReport}
                    disabled={reportedByMe}
                    size="small"
                    aria-label={reportedByMe ? "Denunciado" : "Denunciar post"}
                  >
                    <FlagIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>

          {commentsOpen && <PostComments postId={post.id} onCountChange={handleCommentCountChange} />}

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
