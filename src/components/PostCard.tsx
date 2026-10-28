"use client";

import { loginHref } from "@/lib/safeRedirect";
import { useCallback, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import RepeatIcon from "@mui/icons-material/Repeat";
import StarIcon from "@mui/icons-material/Star";
import NextLink from "next/link";
import { SpoilerGate } from "@/components/SpoilerGate";
import { PostBodyText } from "@/components/PostBodyText";
import { HashtagRow } from "@/components/HashtagRow";
import { ReportDialog } from "@/components/ReportDialog";
import { Box, ButtonBase, Link as MuiLink, Menu, MenuItem, Stack, Typography, Button } from "@mui/material";
import { LikeToggle } from "@/components/LikeToggle";
import { PostComments } from "@/components/PostComments";
import { PostImageCarousel } from "@/components/PostImageCarousel";
import { WorkPreviewTrigger } from "@/components/WorkPreview";
import { UserAvatar } from "@/components/UserAvatar";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { splitTrailingHashtags } from "@/lib/hashtags";
import { AchievementTitleBadge } from "@/components/AchievementTitleBadge";
import { formatRelativeTime } from "@/lib/relativeTime";
import { formatTimeInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";
import type { PostDTO } from "@/lib/postDto";
import { spoilerLabel, truncateKeepingSpoilers } from "@/lib/spoilers";

// Ponto de corte do "ver mais" pra legenda de post com imagem (lote 1 do
// Epic 27, mesmo corte dos comentários longos).
const LONG_CAPTION_THRESHOLD = 220;

/** Ação textual do Figma (ReplyAction/ShareAction): ícone de 16 px + texto de 12 px, alvo de 44 px. */
const actionSx = {
  display: "inline-flex",
  alignItems: "center",
  gap: 1,
  minHeight: 44,
  fontSize: 12,
  color: "text.secondary",
  borderRadius: "6px",
  whiteSpace: "nowrap",
} as const;

/**
 * Publicação do feed, no formato "SocialPost / Compacta" do Figma
 * (`13:41204`): sem cartão — identidade (avatar, nome, @identificador ·
 * tempo, menu "···"), texto, obra com link, hashtags e a fileira
 * Curtir · Responder · Compartilhar · Denunciar/Excluir.
 */
export function PostCard({
  post,
  onDeleted,
  onQuote,
  onCommentCountChange,
  onRepostChange,
  onLikeChange,
  onReportChange,
  initialCommentsOpen = false,
  commentsHeading = false,
  timeStyle = "relative",
  followingLabel = false,
}: {
  post: PostDTO;
  /** "relative" = "há 18 min" (Para você); "clock" = "12:42" no fuso da conta (Seguindo/Recentes). */
  timeStyle?: "relative" | "clock";
  /** Aba Seguindo: acrescenta "· Seguindo usuário" à linha de identidade. */
  followingLabel?: boolean;
  /** Página dedicada de discussão abre as respostas direto. */
  initialCommentsOpen?: boolean;
  /** Mostra o título "Respostas" acima da lista (página de discussão). */
  commentsHeading?: boolean;
  onDeleted: (id: string) => void;
  /** Abre o editor de nova publicação em modo citação (Epic 25). */
  onQuote: (post: PostDTO) => void;
  /** Sobe até o FeedView/UserPostList — ver comentário logo abaixo sobre
   * por que a contagem não pode viver só no estado local deste card. */
  onCommentCountChange: (postId: string, count: number) => void;
  /** Idem, pro estado de repost (ver comentário em handleRepostToggle).
   * `confirmed` distingue a atualização otimista (só troca o estado,
   * nunca remove nada — segura de desfazer se a requisição falhar) da
   * confirmação do servidor (só aí é seguro remover do feed a entrada
   * "eu repostei" que acabou de ser desfeita). */
  onRepostChange: (postId: string, reposted: boolean, confirmed: boolean) => void;
  /** Idem, pro estado de curtida — ver comentário em LikeToggle.tsx. */
  onLikeChange: (postId: string, liked: boolean, likeCount: number) => void;
  /** Idem, pro estado de denúncia (achado real da 20ª rodada, Epic 18). */
  onReportChange: (postId: string, reported: boolean) => void;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const loggedOut = user === null;
  const { preference } = useTitlePreference();
  const timeZone = useTimeZone();
  // Post só congela romaji/inglês na criação (Epic 22 — sem nativo/
  // português), mas o card respeita a preferência de idioma (6ª rodada).
  const animeTitle =
    post.animeTitleRomaji === null
      ? null
      : resolveTitleTextLenient(
          preference,
          { titleRomaji: post.animeTitleRomaji, titleEnglish: post.animeTitleEnglish, titleNative: post.animeTitleNative },
          post.animeTitleRomaji
        );
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [reposting, setReposting] = useState(false);
  const [quotedCoverBroken, setQuotedCoverBroken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareAnchor, setShareAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const shareMenuId = useId();
  const moreMenuId = useId();

  // Fileira final de hashtags separada do texto (Figma: texto primeiro,
  // hashtags numa linha própria); hashtags no meio do texto seguem inline.
  const { body: displayBody, tags: trailingTags } = useMemo(() => splitTrailingHashtags(post.body), [post.body]);
  const captionCut = useMemo(() => truncateKeepingSpoilers(displayBody, LONG_CAPTION_THRESHOLD), [displayBody]);
  // "Spoiler de Frieren · até o episódio 18": o aviso dos spoilers desta publicação (inteira, trechos e imagens).
  const postSpoilerLabel = spoilerLabel({ work: animeTitle, episode: post.spoilerEpisode });

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

  function goLogin() {
    router.push(loginHref(window.location.pathname + window.location.search));
  }

  function handleReport() {
    // O botão continua visível pra quem não tem conta, o clique é que leva
    // pro login (Feed público) em vez de ficar `disabled`.
    if (loggedOut) return goLogin();
    // Motivo + confirmação antes de enviar (Figma 13:43571, fluxo G).
    setReportOpen(true);
  }

  function handleQuoteClick() {
    setShareAnchor(null);
    if (loggedOut) return goLogin();
    onQuote(post);
  }

  // O estado de repost sobe pro pai (FeedView/UserPostList) em vez de viver
  // só neste card — o MESMO post pode aparecer 2x na mesma página (uma vez
  // como ele mesmo, outra como repost de alguém, ver src/lib/postFeedDto.ts),
  // e as 2 instâncias precisam concordar sobre "eu repostei isso?"
  // (achado real da 18ª rodada de auditoria, Epic 18).
  async function handleRepostToggle() {
    setShareAnchor(null);
    if (loggedOut) return goLogin();
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

  async function copyLink() {
    setMoreAnchor(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/publicacao/${post.id}`);
    } catch {
      setError("Não foi possível copiar o link");
    }
  }

  // useCallback pra manter a mesma referência entre renders — o efeito de
  // carregamento do PostComments depende disso pra não refazer o fetch toda
  // vez que o PostCard re-renderiza por outro motivo enquanto a thread está
  // aberta. Recebe a contagem ABSOLUTA e sobe pro pai (achados das 17ª/18ª
  // rodadas de auditoria, Epic 18).
  const handleCommentCountChange = useCallback(
    (count: number) => onCommentCountChange(post.id, count),
    [post.id, onCommentCountChange]
  );

  const hasImages = post.imageUrls.length > 0;
  const when = timeStyle === "clock" ? formatTimeInZone(new Date(post.createdAt), timeZone) : formatRelativeTime(post.createdAt);
  const handleAndTime = `${post.author.handle ? `@${post.author.handle} · ` : ""}${when}${followingLabel ? " · Seguindo usuário" : ""}`;

  return (
    <Box
      component="article"
      data-testid={`post-card-${post.id}`}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        py: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {post.repostedBy && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary" }}>
          <RepeatIcon sx={{ fontSize: 14 }} />
          <Typography sx={{ fontSize: 12 }}>{post.repostedBy.displayName} repostou</Typography>
        </Stack>
      )}

      {/* Identidade: avatar 28 · nome · @identificador · tempo · menu "···" */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <UserAvatar id={post.author.id} displayName={post.author.displayName} avatarUrl={post.author.avatarUrl} size={28} />
        <MuiLink
          component={NextLink}
          href={`/users/${post.author.id}`}
          underline="hover"
          sx={{ fontWeight: 700, fontSize: 12, color: "text.primary", whiteSpace: "nowrap" }}
        >
          {post.author.displayName}
        </MuiLink>
        <MuiLink
          component={NextLink}
          href={`/publicacao/${post.id}`}
          underline="hover"
          aria-label="Abrir discussão"
          sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {handleAndTime}
        </MuiLink>
        <Box sx={{ flex: 1 }} />
        <ButtonBase
          onClick={(e) => setMoreAnchor(e.currentTarget)}
          aria-label="Mais opções"
          aria-haspopup="true"
          aria-controls={moreAnchor ? moreMenuId : undefined}
          sx={{ minWidth: 44, minHeight: 44, borderRadius: "6px", fontSize: 14, fontWeight: 700, color: "text.secondary" }}
        >
          ···
        </ButtonBase>
        <Menu id={moreMenuId} anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
          <MenuItem component={NextLink} href={`/publicacao/${post.id}`} onClick={() => setMoreAnchor(null)}>
            Abrir discussão
          </MenuItem>
          <MenuItem onClick={copyLink}>Copiar link da publicação</MenuItem>
        </Menu>
      </Stack>

      {post.author.title && (
        <Box sx={{ pl: "36px", mt: -1 }}>
          <AchievementTitleBadge title={post.author.title} />
        </Box>
      )}

      {/* Corpo: spoiler fechado, imagens + legenda, ou texto. O aviso de spoiler diz de qual obra e até onde. */}
      {post.isSpoiler ? (
        <SpoilerGate<{ body: string; imageUrls: string[]; imageAlts?: string[]; imageSpoilers?: boolean[] }>
          revealUrl={`/api/posts/${post.id}/reveal`}
          label={postSpoilerLabel}
          render={(d) => (
            <Box>
              {d.imageUrls.length > 0 && <PostImageCarousel imageUrls={d.imageUrls} imageAlts={d.imageAlts} />}
              <Typography sx={{ whiteSpace: "pre-wrap", fontSize: 16, mt: d.imageUrls.length > 0 ? 1.5 : 0, overflowWrap: "anywhere" }}>
                <PostBodyText text={d.body} spoilerLabel={postSpoilerLabel} />
              </Typography>
            </Box>
          )}
        />
      ) : (
        <>
          {hasImages && <PostImageCarousel imageUrls={post.imageUrls} imageAlts={post.imageAlts} imageSpoilers={post.imageSpoilers} spoilerLabel={postSpoilerLabel} />}
          <Box>
            <Typography sx={{ whiteSpace: "pre-wrap", fontSize: 16, color: "text.primary", overflowWrap: "anywhere" }}>
              <PostBodyText
                // O corte da legenda longa nunca parte um trecho de spoiler ao meio (partido, apareceria descoberto).
                text={hasImages && !captionExpanded && captionCut.truncated ? `${captionCut.text}…` : displayBody}
                spoilerLabel={postSpoilerLabel}
              />
            </Typography>
            {hasImages && captionCut.truncated && (
              <Button onClick={() => setCaptionExpanded((v) => !v)} size="small" sx={{ px: 0, minWidth: 0, minHeight: 0, color: "text.secondary" }}>
                {captionExpanded ? "ver menos" : "ver mais"}
              </Button>
            )}
          </Box>
        </>
      )}

      {/* Obra (contexto explícito) — abre a prévia da obra (sinopse, gêneros, página) sem sair do Feed; ao lado, a comunidade dela */}
      {animeTitle !== null && post.workKey !== null && (
        <Typography component="div" className="font-jp" sx={{ fontSize: 12, color: "text.secondary", display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <WorkPreviewTrigger
            inline
            label={animeTitle}
            testId={`post-work-${post.id}`}
            info={{
              titles: { titleRomaji: post.animeTitleRomaji ?? animeTitle, titleEnglish: post.animeTitleEnglish, titleNative: post.animeTitleNative },
              coverImage: post.animeCoverImage,
              href: `/anime/${post.workKey}`,
              anilistId: post.anilistId,
              meta: [post.animeFormat],
            }}
            actions={
              post.hasCommunity ? (
                <Button component={NextLink} href={`/comunidades/${post.workKey}`} size="small" sx={{ color: "text.secondary" }}>
                  Comunidade →
                </Button>
              ) : undefined
            }
            sx={{ display: "inline-flex", width: "auto", alignItems: "center", gap: 0.5, borderRadius: "4px", "&:hover": { textDecoration: "underline" } }}
          >
            {post.favoritedByMe && <StarIcon role="img" aria-label="Anime favoritado" sx={{ fontSize: 14, color: "secondary.main" }} />}
            <span lang={post.animeTitleNative && animeTitle === post.animeTitleNative ? "ja" : undefined}>
              {animeTitle}
              {post.animeFormat ? ` · ${post.animeFormat}` : ""}
            </span>
          </WorkPreviewTrigger>
          {post.hasCommunity && (
            <MuiLink component={NextLink} href={`/comunidades/${post.workKey}`} underline="hover" color="inherit" data-testid={`post-community-${post.id}`} sx={{ fontWeight: 700 }}>
              Comunidade →
            </MuiLink>
          )}
        </Typography>
      )}

      {/* Citação: "Referência interna" (Figma 13:41325) */}
      {post.quotedUnavailable && !post.quotedPost && (
        <Box
          data-testid="quoted-unavailable"
          sx={{ p: 2, bgcolor: "background.paper", borderRadius: "10px", color: "text.secondary", display: "flex", flexDirection: "column", gap: 1 }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: 12 }}>↗ Publicação original indisponível</Typography>
          <Typography sx={{ fontSize: 14 }}>
            Conteúdo removido ou não acessível. Nenhum trecho ou texto do autor original é exibido.
          </Typography>
        </Box>
      )}

      {post.quotedPost && (
        <Box sx={{ p: 2, bgcolor: "background.paper", borderRadius: "10px", display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 12, color: "text.secondary" }}>
            ↗ Publicação de{" "}
            <MuiLink component={NextLink} href={`/users/${post.quotedPost.author.id}`} underline="hover" color="inherit">
              {post.quotedPost.author.displayName}
            </MuiLink>
            {post.quotedPost.author.handle ? ` · @${post.quotedPost.author.handle}` : ""}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            {post.quotedPost.imageUrl && !quotedCoverBroken && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.quotedPost.imageUrl}
                alt={post.quotedPost.imageAlt ?? ""}
                onError={() => setQuotedCoverBroken(true)}
                style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              {post.quotedPost.isSpoiler ? (
                <SpoilerGate<{ body: string }>
                  revealUrl={`/api/posts/${post.quotedPost.id}/reveal`}
                  label={spoilerLabel({ work: post.quotedPost.animeTitleEnglish ?? post.quotedPost.animeTitleRomaji })}
                  render={(d) => (
                    <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      <PostBodyText text={d.body} spoilerLabel={spoilerLabel({ work: post.quotedPost?.animeTitleEnglish ?? post.quotedPost?.animeTitleRomaji })} />
                    </Typography>
                  )}
                />
              ) : (
                <Typography
                  sx={{ fontSize: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                >
                  {splitTrailingHashtags(post.quotedPost.body).body}
                </Typography>
              )}
              <MuiLink component={NextLink} href={`/publicacao/${post.quotedPost.id}`} underline="hover" sx={{ fontSize: 14, color: "text.primary" }}>
                Abrir publicação original
              </MuiLink>
            </Box>
          </Stack>
        </Box>
      )}

      <HashtagRow tags={trailingTags} />

      {/* Interações: Curtir · Responder · Compartilhar · Denunciar/Excluir; no celular a linha quebra em vez de vazar. */}
      <Stack direction="row" useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", columnGap: { xs: 2, sm: 3 } }}>
        <LikeToggle postId={post.id} liked={post.likedByMe} likeCount={post.likeCount} onChange={onLikeChange} />

        <ButtonBase onClick={() => setCommentsOpen((v) => !v)} aria-expanded={commentsOpen} sx={actionSx}>
          <ChatBubbleOutlineIcon sx={{ fontSize: 16 }} />
          <span>Responder · {post.commentCount}</span>
        </ButtonBase>

        <ButtonBase
          onClick={(e) => setShareAnchor(e.currentTarget)}
          aria-haspopup="true"
          aria-controls={shareAnchor ? shareMenuId : undefined}
          disabled={reposting}
          sx={actionSx}
        >
          <RepeatIcon sx={{ fontSize: 16, color: post.repostedByMe ? "primary.main" : undefined }} />
          <span>Compartilhar</span>
        </ButtonBase>
        <Menu id={shareMenuId} anchorEl={shareAnchor} open={Boolean(shareAnchor)} onClose={() => setShareAnchor(null)}>
          <MenuItem onClick={handleRepostToggle}>{post.repostedByMe ? "Desfazer repost" : "Repostar"}</MenuItem>
          <MenuItem onClick={handleQuoteClick}>Citar publicação</MenuItem>
        </Menu>

        <Box sx={{ flex: 1 }} />
        {post.isMine ? (
          <ButtonBase onClick={handleDelete} sx={actionSx}>
            Excluir
          </ButtonBase>
        ) : (
          <ButtonBase onClick={handleReport} disabled={post.reportedByMe} sx={actionSx}>
            {post.reportedByMe ? "Denunciado" : "Denunciar"}
          </ButtonBase>
        )}
      </Stack>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        target={{ kind: "post", id: post.id }}
        targetLabel="esta publicação"
        onReported={() => onReportChange(post.id, true)}
      />

      {commentsOpen && (
        <PostComments postId={post.id} commentCount={post.commentCount} onCountChange={handleCommentCountChange} withHeading={commentsHeading} spoilerWork={animeTitle} />
      )}

      {error && (
        <Typography role="alert" sx={{ color: "error.main", fontSize: 12 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
