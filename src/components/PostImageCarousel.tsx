"use client";

import { useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, ButtonBase, IconButton, Popover, Typography } from "@mui/material";

/**
 * Carrossel de imagens do post (Epic 25) — setas só aparecem com mais de
 * 1 imagem. URLs coladas pela pessoa, fora do allowlist do next/image
 * (remotePatterns só cobre AniList/Kitsu), por isso <img> simples com
 * onError silencioso (mesmo padrão já usado pro resto do app) — uma
 * imagem quebrada no meio vira um espaço vazio nessa posição em vez de
 * sumir da navegação (não tenta reindexar as setas em volta dela).
 *
 * A descrição de cada imagem (`imageAlts`, escrita por quem postou) é o texto alternativo lido pelo leitor de tela e,
 * como no X, aparece num selo ALT no canto da imagem, que mostra o texto a quem tocar.
 */
export function PostImageCarousel({ imageUrls, imageAlts = [] }: { imageUrls: string[]; imageAlts?: string[] }) {
  const [index, setIndex] = useState(0);
  const [brokenIndexes, setBrokenIndexes] = useState<Set<number>>(new Set());
  const [altAnchor, setAltAnchor] = useState<HTMLElement | null>(null);

  if (imageUrls.length === 0) return null;

  const clampedIndex = Math.min(index, imageUrls.length - 1);
  const hasMultiple = imageUrls.length > 1;
  const current = imageUrls[clampedIndex];
  const currentAlt = (imageAlts[clampedIndex] ?? "").trim();
  const isBroken = brokenIndexes.has(clampedIndex);

  function go(e: React.MouseEvent, delta: number) {
    e.preventDefault();
    e.stopPropagation();
    setAltAnchor(null);
    setIndex((i) => (i + delta + imageUrls.length) % imageUrls.length);
  }

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        aspectRatio: "4 / 5",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      {!isBroken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current}
          alt={currentAlt}
          onError={() => setBrokenIndexes((prev) => new Set(prev).add(clampedIndex))}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}

      {currentAlt && !isBroken && (
        <>
          <ButtonBase
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAltAnchor(e.currentTarget);
            }}
            aria-label="Ver a descrição da imagem"
            aria-haspopup="dialog"
            data-testid="image-alt-badge"
            sx={{ position: "absolute", left: 8, bottom: 8, minWidth: 44, minHeight: 32, px: 1, borderRadius: "6px", bgcolor: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", "&.Mui-focusVisible": { outline: "2px solid #ffd400", outlineOffset: 2 } }}
          >
            ALT
          </ButtonBase>
          <Popover
            open={Boolean(altAnchor)}
            anchorEl={altAnchor}
            onClose={() => setAltAnchor(null)}
            onClick={(e) => e.stopPropagation()}
            anchorOrigin={{ vertical: "top", horizontal: "left" }}
            transformOrigin={{ vertical: "bottom", horizontal: "left" }}
            slotProps={{ paper: { role: "dialog", "aria-label": "Descrição da imagem", sx: { maxWidth: 360, p: 2, bgcolor: "#171820", backgroundImage: "none", border: 1, borderColor: "divider", borderRadius: "12px" } } as Record<string, unknown> }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", color: "text.secondary", mb: 0.5 }}>DESCRIÇÃO DA IMAGEM</Typography>
            <Typography data-testid="image-alt-text" sx={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {currentAlt}
            </Typography>
          </Popover>
        </>
      )}

      {hasMultiple && (
        <>
          <IconButton
            onClick={(e) => go(e, -1)}
            aria-label="Imagem anterior"
            size="small"
            sx={{
              position: "absolute",
              top: "50%",
              left: 8,
              transform: "translateY(-50%)",
              bgcolor: "rgba(0,0,0,0.5)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={(e) => go(e, 1)}
            aria-label="Próxima imagem"
            size="small"
            sx={{
              position: "absolute",
              top: "50%",
              right: 8,
              transform: "translateY(-50%)",
              bgcolor: "rgba(0,0,0,0.5)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>

          <Box
            sx={{
              position: "absolute",
              bottom: 8,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 0.5,
            }}
          >
            {imageUrls.map((_, i) => (
              <Box
                key={i}
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: i === clampedIndex ? "#fff" : "rgba(255,255,255,0.5)",
                }}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
