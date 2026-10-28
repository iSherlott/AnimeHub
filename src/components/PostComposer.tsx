"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  InputBase,
  Stack,
  Typography,
} from "@mui/material";
import { AnimeContextPicker, type RelatedAnime } from "@/components/AnimeContextPicker";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { HashtagRow } from "@/components/HashtagRow";
import { PostImageAttachments } from "@/components/PostImageAttachments";
import { UserAvatar } from "@/components/UserAvatar";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { canonicalHashtagKey, extractHashtags, MAX_HASHTAGS_PER_POST } from "@/lib/hashtags";
import { DRAFT_IMAGES_KEY, MAX_COMPOSER_IMAGES, usePostImages } from "@/lib/usePostImages";

const MAX_BODY_LENGTH = 500;
const DRAFT_KEY = "anime-hub:draft:new-post";

export type ComposerQuote = { id: string; author: string; snippet: string };

type Suggestion = { key: string; display: string; kind: string };
const KIND_LABEL: Record<string, string> = { WORK: "Obra", SEASON: "Temporada", GENRE: "Gênero", TOPIC: "Tópico" };

/** Seção do editor com título de 26 px (Figma: "Anime relacionado", "Hashtags"). */
function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/**
 * Editor "Nova publicação" (Figma `13:41840` / `13:41925`): identidade pública,
 * campo "SUA PUBLICAÇÃO", associação EXPLÍCITA e opcional de obra, hashtags
 * com sugestões, proteção de spoilers e Cancelar/Publicar.
 *
 * - Imagens: até 4 (GIF continua animado), enviadas na hora; o rascunho delas vem junto do campo do Feed.
 * - Cancelar com texto pede confirmação para descartar; erro preserva o
 *   rascunho; publicar desabilita novo envio (guarda síncrona anti-duplicidade).
 * - O rascunho vive em sessionStorage (sobrevive ao login e à navegação).
 * - Hashtags digitadas no texto continuam valendo; as do campo "Hashtags" são
 *   anexadas ao final do texto numa linha própria (limite de 5 por publicação).
 */
export function PostComposer({
  initialAnime = null,
  quote = null,
}: {
  initialAnime?: RelatedAnime | null;
  quote?: ComposerQuote | null;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const [body, setBody] = useState("");
  const [anime, setAnime] = useState<RelatedAnime | null>(initialAnime);
  const [tags, setTags] = useState<Array<{ key: string; display: string }>>([]);
  const [tagInput, setTagInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [spoiler, setSpoiler] = useState(false);
  const [quoted, setQuoted] = useState<ComposerQuote | null>(quote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const postingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const images = usePostImages(DRAFT_IMAGES_KEY);
  // Imagem que falhou bloqueia o Publicar até ser removida: senão a pessoa acharia que ela foi junto.
  const canPublish = (Boolean(body.trim()) || images.urls.length > 0) && !images.uploading && !images.failed && !busy;

  // Rascunho preservado entre navegações/login (sessionStorage; falha em silêncio).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setBody(saved);
    } catch {
      // sessionStorage indisponível: editor abre vazio.
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

  // Sugestões de hashtag conforme digita (existente × novo tema).
  useEffect(() => {
    const q = tagInput.trim().replace(/^#/, "");
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/hashtags?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { matches: [] }))
        .then((data) => {
          if (!cancelled) setSuggestions(data.matches ?? []);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tagInput]);

  const bodyTags = extractHashtags(body);
  const allKeys = new Set([...bodyTags.map((t) => t.key), ...tags.map((t) => t.key)]);
  const tagLimitReached = allKeys.size >= MAX_HASHTAGS_PER_POST;
  const typedRaw = tagInput.trim().replace(/^#/, "");
  const typedKey = canonicalHashtagKey(typedRaw);
  const exact = suggestions.find((s) => s.key === typedKey);
  const visibleSuggestions = typedRaw ? suggestions.filter((s) => !allKeys.has(s.key)) : [];

  function addTag(display: string) {
    const clean = display.trim().replace(/^#/, "").replace(/[^\p{L}\p{N}_\p{M}]/gu, "");
    if (!clean) return;
    const key = canonicalHashtagKey(clean);
    if (allKeys.has(key) || /^\p{N}+$/u.test(key)) {
      setTagInput("");
      return;
    }
    if (tagLimitReached) {
      setError(`No máximo ${MAX_HASHTAGS_PER_POST} hashtags por publicação`);
      return;
    }
    setError(null);
    setTags((prev) => [...prev, { key, display: clean }]);
    setTagInput("");
  }

  function removeTag(key: string) {
    setTags((prev) => prev.filter((t) => t.key !== key));
  }

  function discard() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // nada a limpar
    }
    images.clear();
    router.push("/");
  }

  function requestCancel() {
    if (body.trim() || tags.length > 0 || images.items.length > 0) {
      setConfirmDiscard(true);
      return;
    }
    discard();
  }

  async function publish() {
    if (postingRef.current || !canPublish) return;
    const text = body.trim();
    postingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const extra = tags.filter((t) => !bodyTags.some((b) => b.key === t.key));
      const full = extra.length ? `${text}\n${extra.map((t) => `#${t.display}`).join(" ")}`.trim() : text;
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: full, imageUrls: images.urls, anilistId: anime?.anilistId ?? undefined, work: anime && anime.anilistId === null ? anime.work : undefined, isSpoiler: spoiler, quotedPostId: quoted?.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Não foi possível publicar. Texto, associação e escolha de spoilers foram mantidos. Você pode tentar novamente.");
        return;
      }
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // nada a limpar
      }
      images.clear();
      router.push(`/publicacao/${data.post.id}`);
    } catch {
      setError("Não foi possível publicar. Texto, associação e escolha de spoilers foram mantidos. Você pode tentar novamente.");
    } finally {
      postingRef.current = false;
      setBusy(false);
    }
  }

  const displayName = user?.displayName ?? "";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Identidade pública */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {user && <UserAvatar id={user.id} displayName={displayName} avatarUrl={user.avatarUrl} size={28} />}
        <Typography sx={{ fontWeight: 700, fontSize: 12 }}>{displayName}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {user?.handle ? `@${user.handle} · ` : ""}Publicação pública
        </Typography>
      </Stack>

      {quoted && (
        <Box role="status" sx={{ p: 2, bgcolor: "background.paper", borderRadius: "10px", display: "flex", justifyContent: "space-between", gap: 2, alignItems: "center" }}>
          <Typography sx={{ fontSize: 14, color: "text.secondary", minWidth: 0 }}>
            ↗ Citando publicação de {quoted.author}
            {quoted.snippet ? <>: &ldquo;{quoted.snippet}&rdquo;</> : null}
          </Typography>
          <ButtonBase onClick={() => setQuoted(null)} aria-label="Cancelar citação" sx={{ minHeight: 44, minWidth: 44, borderRadius: "6px", color: "text.secondary" }}>
            ✕
          </ButtonBase>
        </Box>
      )}

      {/* Campo de texto */}
      <Box sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "12px", p: 3, minHeight: 180, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography component="label" htmlFor="post-body" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
          SUA PUBLICAÇÃO
        </Typography>
        <InputBase
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY_LENGTH))}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
            if (files.length) {
              e.preventDefault();
              images.addFiles(files);
            }
          }}
          placeholder="Que conversa você quer começar?"
          autoFocus
          multiline
          minRows={3}
          maxRows={14}
          fullWidth
          inputProps={{ "aria-label": "Sua publicação" }}
          sx={{ fontSize: 16, p: 0, alignItems: "flex-start" }}
        />
        <Typography sx={{ fontSize: 14, color: body.length >= MAX_BODY_LENGTH ? "error.main" : "text.secondary" }}>
          {body.length}/{MAX_BODY_LENGTH} caracteres · limite provisório
        </Typography>
      </Box>

      {/* Imagens */}
      <EditorSection title="Imagens">
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Opcional. Até {MAX_COMPOSER_IMAGES} imagens (JPG, PNG, WebP, AVIF ou GIF, que continua animado), de até 8 MB cada.
          Também dá para colar uma imagem no campo do texto.
        </Typography>
        <PostImageAttachments items={images.items} onRemove={images.remove} disabled={busy} />
        {images.notice && (
          <Typography role="status" sx={{ fontSize: 13, color: "warning.main" }}>
            {images.notice}
          </Typography>
        )}
        <Box>
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={busy || images.full}
            startIcon={<ImageOutlinedIcon />}
            sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}
          >
            {images.full ? `${MAX_COMPOSER_IMAGES} imagens (o máximo)` : "Adicionar imagem"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            multiple
            hidden
            data-testid="editor-image-input"
            onChange={(e) => {
              if (e.target.files) images.addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </Box>
      </EditorSection>

      {/* Anime relacionado */}
      <EditorSection title="Anime relacionado">
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Opcional. Escolha a produção certa; mencionar um nome no texto não cria uma associação.
        </Typography>
        <AnimeContextPicker value={anime} onChange={setAnime} disabled={busy} />
      </EditorSection>

      {/* Hashtags */}
      <EditorSection title="Hashtags">
        <Box sx={{ bgcolor: "background.paper", borderRadius: "10px", p: 2 }}>
          <InputBase
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value.slice(0, 41))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === "Backspace" && !tagInput && tags.length) {
                removeTag(tags[tags.length - 1].key);
              }
            }}
            placeholder="#Direção"
            fullWidth
            inputProps={{ "aria-label": "Adicionar hashtag" }}
            sx={{ fontSize: 14, p: 0 }}
          />
        </Box>
        {tags.length > 0 && (
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, alignItems: "center" }}>
            {tags.map((t) => (
              <ButtonBase key={t.key} onClick={() => removeTag(t.key)} aria-label={`Remover #${t.display}`} sx={{ fontSize: 14, minHeight: 32, borderRadius: "6px" }}>
                #{t.display}
              </ButtonBase>
            ))}
          </Stack>
        )}
        {bodyTags.length > 0 && <HashtagRow tags={bodyTags} />}
        {typedRaw && (
          <Box sx={{ bgcolor: "#171820", borderRadius: "10px", p: 2, display: "flex", flexDirection: "column", gap: 1, fontSize: 14 }}>
            {visibleSuggestions.map((s) => (
              <ButtonBase key={s.key} onClick={() => addTag(s.display)} sx={{ display: "block", textAlign: "left", borderRadius: "6px" }}>
                <Typography component="span" sx={{ fontWeight: 700, fontSize: 14, display: "block" }}>
                  #{s.display} ↵
                </Typography>
                <Typography component="span" sx={{ color: "text.secondary", fontSize: 14 }}>
                  {KIND_LABEL[s.kind] ?? "Tópico"} · hashtag existente
                </Typography>
              </ButtonBase>
            ))}
            {!exact && (
              <ButtonBase onClick={() => addTag(typedRaw)} sx={{ display: "block", textAlign: "left", borderRadius: "6px" }}>
                <Typography component="span" sx={{ color: "text.secondary", fontSize: 14 }}>
                  #{typedRaw} · usar novo tema
                </Typography>
              </ButtonBase>
            )}
          </Box>
        )}
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Maiúsculas e minúsculas levam à mesma hashtag. Selecionar sugestão adiciona o ID canônico, sem duplicatas. Máximo de {MAX_HASHTAGS_PER_POST} por publicação (provisório).
        </Typography>
      </EditorSection>

      {/* Proteção de spoilers */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Checkbox
            id="post-spoiler"
            checked={spoiler}
            onChange={(e) => setSpoiler(e.target.checked)}
            sx={{ p: 0.75, color: "text.secondary" }}
          />
          <Typography component="label" htmlFor="post-spoiler" sx={{ fontWeight: 700, fontSize: 14 }}>
            Contém spoilers
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Desmarcado por padrão. Ative quando o texto revelar acontecimentos. Essa escolha não depende de episódios assistidos.
        </Typography>
      </Box>

      {spoiler && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>COMO APARECERÁ NO FEED</Typography>
          <Box sx={{ bgcolor: "background.paper", borderRadius: "12px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Conteúdo com spoilers</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              {anime ? `${anime.native ?? anime.title} · ` : ""}O texto fica oculto até você escolher revelar.
            </Typography>
          </Box>
        </Box>
      )}

      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Button onClick={requestCancel} sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
          Cancelar
        </Button>
        <Button onClick={publish} disabled={!canPublish} variant="contained" data-testid="publish-send">
          {images.uploading ? "Enviando imagens…" : "Publicar"}
        </Button>
      </Stack>

      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} aria-labelledby="discard-title">
        <DialogTitle id="discard-title">Descartar este rascunho?</DialogTitle>
        <DialogContent>
          <DialogContentText>O texto e as escolhas desta publicação serão perdidos.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Continuar escrevendo</Button>
          <Button onClick={discard} color="primary" variant="contained">
            Descartar
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
