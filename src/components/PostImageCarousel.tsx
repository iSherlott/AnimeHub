"use client";

import { useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, IconButton } from "@mui/material";

/**
 * Carrossel de imagens do post (Epic 25) — setas só aparecem com mais de
 * 1 imagem. URLs coladas pela pessoa, fora do allowlist do next/image
 * (remotePatterns só cobre AniList/Kitsu), por isso <img> simples com
 * onError silencioso (mesmo padrão já usado pro resto do app) — uma
 * imagem quebrada no meio vira um espaço vazio nessa posição em vez de
 * sumir da navegação (não tenta reindexar as setas em volta dela).
 */
export function PostImageCarousel({ imageUrls }: { imageUrls: string[] }) {
  const [index, setIndex] = useState(0);
  const [brokenIndexes, setBrokenIndexes] = useState<Set<number>>(new Set());

  if (imageUrls.length === 0) return null;

  const clampedIndex = Math.min(index, imageUrls.length - 1);
  const hasMultiple = imageUrls.length > 1;
  const current = imageUrls[clampedIndex];
  const isBroken = brokenIndexes.has(clampedIndex);

  function go(e: React.MouseEvent, delta: number) {
    e.preventDefault();
    e.stopPropagation();
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
          alt=""
          onError={() => setBrokenIndexes((prev) => new Set(prev).add(clampedIndex))}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
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
