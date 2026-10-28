"use client";

import { useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import CloseIcon from "@mui/icons-material/Close";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import LiveTvOutlinedIcon from "@mui/icons-material/LiveTvOutlined";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import TagIcon from "@mui/icons-material/Tag";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, InputBase, Menu, MenuItem, TextField, Tooltip, Typography } from "@mui/material";
import { AnimeContextPicker, type RelatedAnime } from "@/components/AnimeContextPicker";
import { PostImageAttachments } from "@/components/PostImageAttachments";
import { UserAvatar } from "@/components/UserAvatar";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { PostDTO } from "@/lib/postDto";
import { DRAFT_IMAGES_KEY, MAX_COMPOSER_IMAGES, usePostImages } from "@/lib/usePostImages";
import { parseSpoilerEpisode } from "@/lib/spoilers";
import { wrapSpoilerSelection } from "@/lib/wrapSpoiler";

const MAX_BODY_LENGTH = 500;
/** O mesmo rascunho do editor completo (/publicar): "Abrir editor completo" leva o texto junto. */
const DRAFT_KEY = "anime-hub:draft:new-post";

const toolSx = { width: 44, height: 44, color: "primary.light", "&[aria-pressed='true']": { bgcolor: "rgba(255,59,92,0.14)" } } as const;

/**
 * Campo de publicar no topo do Feed (no lugar do botão "+ Nova publicação"), no jeito do X: avatar e "O que está
 * acontecendo?"; ao focar, a barra com o que uma publicação do AnimeHub tem — anime relacionado, hashtag, spoiler e o
 * editor completo (que leva o texto e as imagens junto) — e o botão Postar. Imagem: até 4, pelo botão ou colando no campo;
 * cada uma sobe na hora (GIF continua animado) e o Postar espera o envio terminar. Pode postar só imagem. A publicação
 * nova entra no topo da lista, sem sair do Feed.
 */
export function FeedComposer({ onPosted }: { onPosted: (post: PostDTO) => void }) {
  const user = useCurrentUser();
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [anime, setAnime] = useState<RelatedAnime | null>(null);
  const [pickingAnime, setPickingAnime] = useState(false);
  const [spoiler, setSpoiler] = useState(false);
  // "Até o episódio N" do spoiler (opcional); o menu do spoiler escolhe entre a publicação inteira e um trecho.
  const [spoilerEpisode, setSpoilerEpisode] = useState("");
  const [spoilerMenu, setSpoilerMenu] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const postingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const images = usePostImages(DRAFT_IMAGES_KEY);

  // Rascunho compartilhado com o editor completo (sessionStorage; falha em silêncio).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        // Só no navegador: o rascunho mora no sessionStorage.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBody(saved);
        setExpanded(true);
      }
    } catch {
      // sessionStorage indisponível: campo abre vazio.
    }
  }, []);
  useEffect(() => {
    try {
      if (body) sessionStorage.setItem(DRAFT_KEY, body);
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // idem
    }
  }, [body]);

  if (!user) return null;

  const text = body.trim();
  // Imagem que falhou bloqueia o Postar até ser removida: senão a pessoa acharia que ela foi junto.
  const canPost = (Boolean(text) || images.urls.length > 0) && !images.uploading && !images.failed && !busy;
  const remaining = MAX_BODY_LENGTH - body.length;
  const fullEditorHref = `/publicar${anime ? (anime.anilistId !== null ? `?anilistId=${anime.anilistId}` : `?obra=${encodeURIComponent(anime.work)}`) : ""}`;

  function insertHashtag() {
    const el = inputRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const before = body.slice(0, start);
    const glue = before && !/\s$/.test(before) ? " " : "";
    const next = `${before}${glue}#${body.slice(end)}`.slice(0, MAX_BODY_LENGTH);
    setBody(next);
    setExpanded(true);
    const caret = Math.min(start + glue.length + 1, next.length);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  function hideSelectionAsSpoiler() {
    const el = inputRef.current;
    const wrapped = wrapSpoilerSelection(body, el?.selectionStart ?? body.length, el?.selectionEnd ?? body.length, MAX_BODY_LENGTH);
    setSpoilerMenu(null);
    if (!wrapped) return;
    setBody(wrapped.value);
    setExpanded(true);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(wrapped.caretStart, wrapped.caretEnd);
    });
  }

  async function post() {
    if (postingRef.current || !canPost) return;
    const episode = spoiler ? parseSpoilerEpisode(spoilerEpisode) : null;
    if (episode === undefined) {
      setError("O episódio do spoiler vai de 1 a 9999.");
      return;
    }
    postingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, imageUrls: images.urls, imageAlts: images.alts, imageSpoilers: images.spoilers, anilistId: anime?.anilistId ?? undefined, work: anime && anime.anilistId === null ? anime.work : undefined, isSpoiler: spoiler, spoilerEpisode: episode ?? undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.post) {
        setError(data?.error ?? "Não foi possível publicar. O texto continua aqui para você tentar de novo.");
        return;
      }
      onPosted(data.post as PostDTO);
      images.clear();
      setBody("");
      setAnime(null);
      setSpoiler(false);
      setSpoilerEpisode("");
      setExpanded(false);
    } catch {
      setError("Não foi possível publicar. O texto continua aqui para você tentar de novo.");
    } finally {
      postingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Box component="section" aria-label="Nova publicação" data-testid="feed-composer" sx={{ display: "flex", gap: 1.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ pt: 0.5, flexShrink: 0 }}>
        <UserAvatar id={user.id} displayName={user.displayName} avatarUrl={user.avatarUrl} size={40} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <InputBase
          inputRef={inputRef}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY_LENGTH))}
          onFocus={() => setExpanded(true)}
          // Colar uma imagem (print, cópia do navegador) anexa como se tivesse escolhido o arquivo.
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length) {
              e.preventDefault();
              images.addFiles(files);
              setExpanded(true);
            }
          }}
          onKeyDown={(e) => {
            // Ctrl/⌘ + Enter publica, como no editor completo dos outros sites.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void post();
            }
          }}
          placeholder="O que está acontecendo?"
          multiline
          minRows={expanded ? 2 : 1}
          maxRows={12}
          fullWidth
          inputProps={{ "aria-label": "O que está acontecendo?" }}
          sx={{ fontSize: { xs: 18, sm: 20 }, lineHeight: 1.4, py: 0.75, alignItems: "flex-start", "& textarea::placeholder": { color: "text.secondary", opacity: 1 } }}
        />

        <PostImageAttachments items={images.items} onRemove={images.remove} onAltChange={images.setAlt} onToggleSpoiler={images.toggleSpoiler} disabled={busy} />
        {images.notice && (
          <Typography role="status" sx={{ fontSize: 13, color: "warning.main" }}>
            {images.notice}
          </Typography>
        )}

        {(anime || spoiler) && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {anime && <Chip data-testid="composer-anime" label={`Sobre: ${anime.title}`} onDelete={() => setAnime(null)} size="small" sx={{ fontWeight: 700 }} />}
            {spoiler && <Chip label="Contém spoilers" onDelete={() => setSpoiler(false)} size="small" color="warning" variant="outlined" sx={{ fontWeight: 700 }} />}
            {spoiler && (
              <TextField
                size="small"
                label="Até o episódio"
                value={spoilerEpisode}
                onChange={(e) => setSpoilerEpisode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="opcional"
                slotProps={{ htmlInput: { inputMode: "numeric", "data-testid": "composer-spoiler-episode" } }}
                sx={{ width: 140, "& input": { py: 0.5 } }}
              />
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}

        {(expanded || text || images.items.length > 0) && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider", pt: 1 }}>
            <Box role="toolbar" aria-label="Opções da publicação" sx={{ display: "flex", flexWrap: "nowrap", ml: -1, minWidth: 0 }}>
              <Tooltip title={images.full ? `No máximo ${MAX_COMPOSER_IMAGES} imagens` : "Imagem ou GIF"}>
                <span>
                  <IconButton aria-label="Adicionar imagem" onClick={() => fileRef.current?.click()} disabled={busy || images.full} sx={toolSx}>
                    <ImageOutlinedIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                hidden
                data-testid="composer-image-input"
                onChange={(e) => {
                  if (e.target.files) images.addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Tooltip title="Anime relacionado">
                <IconButton aria-label="Anime relacionado" aria-haspopup="dialog" onClick={() => setPickingAnime(true)} disabled={busy} sx={toolSx}>
                  <LiveTvOutlinedIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Hashtag">
                <IconButton aria-label="Inserir hashtag" onClick={insertHashtag} disabled={busy} sx={toolSx}>
                  <TagIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Spoiler: a publicação inteira ou um trecho">
                <IconButton
                  aria-label="Spoiler"
                  aria-haspopup="menu"
                  aria-expanded={Boolean(spoilerMenu)}
                  aria-pressed={spoiler}
                  onMouseDown={(e) => e.preventDefault() /* mantém a seleção do texto para "esconder um trecho" */}
                  onClick={(e) => setSpoilerMenu(e.currentTarget)}
                  disabled={busy}
                  sx={toolSx}
                >
                  <VisibilityOffOutlinedIcon />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={spoilerMenu} open={Boolean(spoilerMenu)} onClose={() => setSpoilerMenu(null)} disableRestoreFocus>
                <MenuItem
                  role="menuitemcheckbox"
                  aria-checked={spoiler}
                  onClick={() => {
                    setSpoiler((v) => !v);
                    setSpoilerMenu(null);
                  }}
                >
                  {spoiler ? "✓ A publicação inteira tem spoiler" : "A publicação inteira tem spoiler"}
                </MenuItem>
                <MenuItem onClick={hideSelectionAsSpoiler}>Esconder um trecho do texto (o selecionado)</MenuItem>
              </Menu>
              <Tooltip title="Editor completo (citação, hashtags sugeridas, prévia do spoiler)">
                <IconButton component={NextLink} href={fullEditorHref} aria-label="Abrir editor completo" sx={toolSx}>
                  <OpenInFullIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.5 }}>
              {/* Como no X: o contador só aparece perto do limite (e assim a barra cabe numa linha no celular). */}
              {remaining <= 50 && (
                <Typography aria-live="polite" sx={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: remaining <= 20 ? "error.main" : "text.secondary" }}>
                  {remaining}
                </Typography>
              )}
              <Button onClick={post} disabled={!canPost} variant="contained" data-testid="composer-post" sx={{ borderRadius: 999, px: { xs: 2, sm: 2.5 }, minHeight: 40, flexShrink: 0, fontWeight: 700, "&.Mui-disabled": { bgcolor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.45)" } }}>
                {busy ? "Postando…" : images.uploading ? "Enviando…" : "Postar"}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={pickingAnime} onClose={() => setPickingAnime(false)} fullWidth maxWidth="sm" aria-labelledby="composer-anime-title">
        <DialogTitle id="composer-anime-title" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          Anime relacionado
          <IconButton aria-label="Fechar" onClick={() => setPickingAnime(false)} sx={{ width: 44, height: 44 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3 }}>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Opcional. Escolha a produção certa; mencionar um nome no texto não cria uma associação.</Typography>
          <AnimeContextPicker
            value={null}
            onChange={(next) => {
              setAnime(next);
              if (next) setPickingAnime(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
