"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import FlagIcon from "@mui/icons-material/Flag";
import FormatQuoteIcon from "@mui/icons-material/FormatQuoteOutlined";
import RepeatIcon from "@mui/icons-material/Repeat";
import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
import NextLink from "next/link";
import { Avatar, Box, Chip, IconButton, Link as MuiLink, Stack, Tooltip, Typography } from "@mui/material";
import { LikeToggle } from "@/components/LikeToggle";
import { PostComments } from "@/components/PostComments";
import { PostImageCarousel } from "@/components/PostImageCarousel";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { formatRelativeTime } from "@/lib/relativeTime";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import type { PostDTO } from "@/lib/postDto";

// Sem infra de upload de avatar (decisão do Epic 22 — nenhum campo de
// imagem no app tem uma hoje, nem User.avatarUrl é usado pra exibir
// nada). Um card estilo Instagram/Twitter ainda pede um círculo de
// identidade no cabeçalho — iniciais sobre uma cor determinística por
// autor cobrem isso sem precisar de infraestrutura nova. A mesma paleta
// também vira o fundo do bloco-capa de texto (Epic 25) quando o post não
// tem imagem, hasheada pelo anilistId em vez do autor — o mesmo anime
// sempre cai na mesma cor ali, sem precisar de uma coluna nova
// (Anime.accentColor existe, mas não é copiado pro Post).
const AVATAR_COLORS = ["#7C4DFF", "#00BFA5", "#FF6D00", "#2979FF", "#D500F9", "#FFAB00", "#F50057"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function avatarColor(authorId: string): string {
  return AVATAR_COLORS[hashString(authorId) % AVATAR_COLORS.length];
}

function coverColor(anilistId: number): string {
  return AVATAR_COLORS[hashString(String(anilistId)) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function PostCard({
  post,
  onDeleted,
  onQuote,
  onCommentCountChange,
  onRepostChange,
  onLikeChange,
  onReportChange,
}: {
  post: PostDTO;
  onDeleted: (id: string) => void;
  /** Sobe até o FeedView, que abre o compositor em modo citação (Epic 25). */
  onQuote: (post: PostDTO) => void;
  /** Sobe até o FeedView/UserPostList — ver comentário logo abaixo sobre
   * por que a contagem não pode viver só no estado local deste card. */
  onCommentCountChange: (postId: string, count: number) => void;
  /** Idem, pro estado de repost (ver comentário em handleRepostToggle).
   * `confirmed` distingue a atualização otimista (só troca o ícone,
   * nunca remove nada — segura de desfazer se a requisição falhar) da
   * confirmação do servidor (só aí é seguro remover do feed a entrada
   * "eu repostei" que acabou de ser desfeita). */
  onRepostChange: (postId: string, reposted: boolean, confirmed: boolean) => void;
  /** Idem, pro estado de curtida — ver comentário em LikeToggle.tsx
   * (achado real da 19ª rodada de auditoria, Epic 18: este era o único
   * dos 3 estados "por post" que ainda tinha ficado de fora da correção
   * da 18ª rodada). */
  onLikeChange: (postId: string, liked: boolean, likeCount: number) => void;
  /** Idem, pro estado de denúncia — o último campo "por post" que ainda
   * vivia em `useState` local deste card, achado real da 20ª rodada de
   * auditoria (Epic 18): denunciar numa instância (ex.: a de "Fulano
   * repostou") não refletia "Denunciado" na outra instância do mesmo
   * post. */
  onReportChange: (postId: string, reported: boolean) => void;
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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reposting, setReposting] = useState(false);
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de capa
  // que 404 (achado real da 6ª rodada de auditoria, Epic 18). Campo da
  // capa do anime (chip), não das imagens do post (PostImageCarousel
  // cuida das suas próprias, uma por índice).
  const [coverBroken, setCoverBroken] = useState(false);
  const [quotedCoverBroken, setQuotedCoverBroken] = useState(false);
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
    onReportChange(post.id, true);
    try {
      const res = await fetch(`/api/posts/${post.id}/report`, { method: "POST" });
      if (!res.ok) {
        onReportChange(post.id, false);
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao denunciar post");
      }
    } catch {
      onReportChange(post.id, false);
      setError("Falha ao denunciar post");
    }
  }

  function handleQuoteClick() {
    if (loggedOut) {
      router.push("/login");
      return;
    }
    onQuote(post);
  }

  // O estado de repost sobe pro pai (FeedView/UserPostList) em vez de
  // viver só neste card — o MESMO post pode aparecer 2x na mesma página
  // (uma vez como ele mesmo, outra como repost de alguém, ver
  // src/lib/postFeedDto.ts), e as 2 instâncias de PostCard precisam
  // concordar sobre "eu repostei isso?" e sobre a entrada "Fulano
  // repostou" continuar válida. Sem isso, desfazer um repost deixava a
  // faixa/o card da entrada antiga presos na tela até recarregar, e uma
  // 2ª instância do mesmo post ficava com o ícone de repost desatualizado
  // (achado real da 18ª rodada de auditoria, Epic 18).
  async function handleRepostToggle() {
    if (loggedOut) {
      router.push("/login");
      return;
    }
    if (reposting) return;
    const next = !post.repostedByMe;
    onRepostChange(post.id, next, false);
    setReposting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/repost`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reposted: next }),
      });
      if (!res.ok) {
        onRepostChange(post.id, !next, false);
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Falha ao repostar");
      } else {
        onRepostChange(post.id, next, true);
      }
    } catch {
      onRepostChange(post.id, !next, false);
      setError("Falha ao repostar");
    } finally {
      setReposting(false);
    }
  }

  // useCallback pra manter a mesma referência entre renders — o efeito de
  // carregamento do PostComments depende disso pra não refazer o fetch
  // toda vez que o PostCard re-renderiza por outro motivo (imagem
  // quebrada, erro, etc.) enquanto a thread está aberta. Recebe a
  // contagem ABSOLUTA (não mais um delta ±1, achado da 17ª rodada) e sobe
  // pro pai (`onCommentCountChange`) em vez de guardar num estado local
  // deste card — o MESMO post pode aparecer 2x na mesma página (uma vez
  // como ele mesmo, outra como repost de alguém), e as 2 instâncias
  // precisam mostrar a mesma contagem; um estado só local nunca soube da
  // atividade na OUTRA instância (achado real da 18ª rodada de
  // auditoria, Epic 18).
  const handleCommentCountChange = useCallback(
    (count: number) => onCommentCountChange(post.id, count),
    [post.id, onCommentCountChange]
  );

  const hasImages = post.imageUrls.length > 0;

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
      {post.repostedBy && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1, color: "text.secondary" }}>
          <RepeatIcon fontSize="small" />
          <Typography variant="caption">{post.repostedBy.displayName} repostou</Typography>
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
          <Avatar sx={{ bgcolor: avatarColor(post.author.id), width: 36, height: 36, fontSize: 15, fontWeight: 700 }}>
            {initials(post.author.displayName)}
          </Avatar>
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
              · {formatRelativeTime(post.createdAt)}
            </Typography>
          </Stack>
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
        sx={{ mb: 1.5, maxWidth: "100%" }}
      />

      {hasImages ? (
        <PostImageCarousel imageUrls={post.imageUrls} />
      ) : (
        // Sem imagem, o próprio texto do post ocupa o espaço visual
        // principal do card em vez de aparecer só como legenda pequena
        // embaixo (achado do pedido de redesenho, Epic 25) — cor de
        // fundo consistente por anime (ver coverColor acima).
        <Box
          sx={{
            minHeight: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            borderRadius: 2,
            bgcolor: coverColor(post.anilistId),
          }}
        >
          <Typography
            variant="h6"
            sx={{ color: "#fff", textAlign: "center", whiteSpace: "pre-wrap", fontWeight: 600 }}
          >
            {post.body}
          </Typography>
        </Box>
      )}

      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 1 }}>
        <LikeToggle
          postId={post.id}
          liked={post.likedByMe}
          likeCount={post.likeCount}
          onChange={onLikeChange}
        />

        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Tooltip title={commentsOpen ? "Fechar comentários" : "Comentários"}>
            <IconButton onClick={() => setCommentsOpen((v) => !v)} size="small" aria-label="Comentários">
              <ChatBubbleOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 16 }}>
            {post.commentCount}
          </Typography>
        </Stack>

        <Tooltip title={loggedOut ? "Entre para citar" : "Citar"}>
          <IconButton onClick={handleQuoteClick} size="small" aria-label="Citar">
            <FormatQuoteIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={loggedOut ? "Entre para repostar" : post.repostedByMe ? "Desfazer repost" : "Repostar"}>
          <IconButton
            onClick={handleRepostToggle}
            disabled={reposting}
            size="small"
            aria-label={post.repostedByMe ? "Desfazer repost" : "Repostar"}
          >
            {post.repostedByMe ? (
              <RepeatIcon fontSize="small" sx={{ color: "success.main" }} />
            ) : (
              <RepeatOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>

        {!post.isMine && (
          <Tooltip
            title={loggedOut ? "Entre para denunciar" : post.reportedByMe ? "Denunciado" : "Denunciar post"}
          >
            <span>
              <IconButton
                onClick={handleReport}
                disabled={post.reportedByMe}
                size="small"
                aria-label={post.reportedByMe ? "Denunciado" : "Denunciar post"}
              >
                <FlagIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>

      {hasImages && (
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
          {post.body}
        </Typography>
      )}

      {post.quotedPost && (
        <Box
          sx={{
            mt: 1.5,
            p: 1.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
            {post.quotedPost.imageUrl && !quotedCoverBroken && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.quotedPost.imageUrl}
                alt=""
                onError={() => setQuotedCoverBroken(true)}
                style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
                {post.quotedPost.author.displayName}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {post.quotedPost.body}
              </Typography>
            </Box>
          </Stack>
        </Box>
      )}

      {commentsOpen && (
        <PostComments postId={post.id} commentCount={post.commentCount} onCountChange={handleCommentCountChange} />
      )}

      {error && (
        <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
