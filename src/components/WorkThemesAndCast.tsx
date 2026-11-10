"use client";

import { useState } from "react";
import NextLink from "next/link";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import FavoriteIcon from "@mui/icons-material/Favorite";
import { Box, Button, Link as MuiLink, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import type { CastView } from "@/lib/workCastTypes";
import type { ThemeView } from "@/lib/animeThemesTypes";

const headingSx = { fontSize: { xs: 22, md: 26 }, fontWeight: 700 } as const;

/** Uma abertura/encerramento: "OP1 · Título — Artistas · eps 1-12", o link para o AnimeThemes e o curtir. */
export function ThemeRow({ theme, signedIn, label }: { theme: ThemeView; signedIn: boolean; label?: string }) {
  const [liked, setLiked] = useState(theme.likedByMe);
  const [likes, setLikes] = useState(theme.likes);
  async function toggle() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const res = await fetch(`/api/themes/${theme.id}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ liked: next }) }).catch(() => null);
    const data = res && res.ok ? await res.json() : null;
    if (data) setLikes(data.likes);
    else {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }
  return (
    <Box component="li" data-testid="work-theme" sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", py: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
      <Box component="span" sx={{ fontSize: 12, fontWeight: 800, color: theme.type === "OP" ? "primary.main" : "secondary.main", minWidth: 40 }}>
        {theme.slug}
      </Box>
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
          {label ? `${label} · ` : ""}
          {theme.title ?? "Sem título"}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {[theme.artists, theme.episodes ? `eps ${theme.episodes}` : null].filter(Boolean).join(" · ")}
        </Typography>
      </Box>
      {theme.sourceUrl && (
        <MuiLink href={theme.sourceUrl} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13 }}>
          Assistir no AnimeThemes ↗
        </MuiLink>
      )}
      {signedIn && (
        <Button size="small" onClick={() => void toggle()} startIcon={liked ? <FavoriteIcon /> : <FavoriteBorderIcon />} aria-pressed={liked} data-testid="theme-like">
          {likes}
        </Button>
      )}
    </Box>
  );
}

/** Seção "Aberturas e encerramentos" da página da obra. */
export function WorkThemes({ themes, signedIn }: { themes: ThemeView[]; signedIn: boolean }) {
  if (themes.length === 0) return null;
  return (
    <Box component="section" id="aberturas" aria-labelledby="themes-heading" sx={{ display: "flex", flexDirection: "column", gap: 1, scrollMarginTop: 150 }} data-testid="work-themes">
      <Typography id="themes-heading" component="h2" sx={headingSx}>
        Aberturas e encerramentos
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
        {themes.map((t) => (
          <ThemeRow key={t.id} theme={t} signedIn={signedIn} />
        ))}
      </Box>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Músicas e vídeos do AnimeThemes; o vídeo abre no site deles.</Typography>
    </Box>
  );
}

/** Seção "Personagens" da página da obra: cada personagem leva à página dele, com o dublador japonês. */
export function WorkCharacters({ cast }: { cast: CastView[] }) {
  if (cast.length === 0) return null;
  return (
    <Box component="section" id="personagens" aria-labelledby="characters-heading" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }} data-testid="work-characters">
      <Typography id="characters-heading" component="h2" sx={headingSx}>
        Personagens
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))", lg: "repeat(3, minmax(0,1fr))" }, gap: 1.5 }}>
        {cast.map((c) => (
          <Box component="li" key={c.characterId} data-testid="work-character" sx={{ display: "flex", gap: 1.5, alignItems: "center", border: 1, borderColor: "divider", borderRadius: "12px", p: 1, bgcolor: "background.paper", minWidth: 0 }}>
            <Box sx={{ position: "relative", width: 48, height: 64, borderRadius: "8px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>{c.image && <CoverImage src={c.image} sizes="48px" />}</Box>
            <Box sx={{ minWidth: 0 }}>
              <MuiLink component={NextLink} href={`/personagem/${c.characterId}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary", overflowWrap: "anywhere" }}>
                {c.name}
              </MuiLink>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{c.role === "MAIN" ? "Principal" : "Apoio"}</Typography>
              {c.voiceActor && (
                <MuiLink component={NextLink} href={`/dublador/${c.voiceActor.id}`} underline="hover" sx={{ fontSize: 12, color: "text.secondary" }}>
                  {c.voiceActor.name}
                </MuiLink>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
