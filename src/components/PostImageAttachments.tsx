"use client";

import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import type { PostImage } from "@/lib/usePostImages";

/** Arranjo do X num bloco 16:9 fixo: 1 inteira; 2 lado a lado; 3 com uma alta à esquerda e duas empilhadas; 4 em 2×2. */
function cellSx(count: number, index: number) {
  if (count === 3 && index === 0) return { gridRow: "1 / span 2" };
  return {};
}

/**
 * Miniaturas das imagens de uma publicação nova, no arranjo do X: o bloco tem sempre a mesma altura (16:9), não importa
 * quantas imagens, para o campo não crescer. Cada uma tem o X para remover, a roda enquanto envia e o aviso se falhou.
 */
export function PostImageAttachments({ items, onRemove, disabled = false }: { items: PostImage[]; onRemove: (id: string) => void; disabled?: boolean }) {
  if (items.length === 0) return null;
  const count = items.length;
  return (
    <Box
      component="ul"
      aria-label="Imagens anexadas"
      data-testid="post-image-attachments"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "grid",
        gap: 0.5,
        aspectRatio: "16 / 9",
        borderRadius: "16px",
        overflow: "hidden",
        gridTemplateColumns: count === 1 ? "1fr" : "1fr 1fr",
        gridTemplateRows: count <= 2 ? "1fr" : "1fr 1fr",
      }}
    >
      {items.map((item, i) => (
        <Box
          component="li"
          key={item.id}
          data-testid="post-image-attachment"
          data-status={item.status}
          data-url={item.url ?? undefined}
          sx={{ position: "relative", minHeight: 0, overflow: "hidden", bgcolor: "#171820", ...cellSx(count, i) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou imagem enviada, fora do otimizador. */}
          <img src={item.preview} alt={`Imagem ${i + 1} de ${count}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: item.status === "done" ? 1 : 0.5 }} />
          {item.status === "uploading" && (
            <Box role="status" aria-label={`Enviando a imagem ${i + 1}`} sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {item.status === "error" && (
            <Box role="alert" sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, p: 1.5, bgcolor: "rgba(8,8,11,0.72)", textAlign: "center" }}>
              <ErrorOutlineIcon sx={{ color: "error.main" }} />
              <Typography sx={{ fontSize: 12 }}>{item.error} Remova para publicar.</Typography>
            </Box>
          )}
          <IconButton
            aria-label={`Remover a imagem ${i + 1}`}
            onClick={() => onRemove(item.id)}
            disabled={disabled}
            sx={{ position: "absolute", top: 4, right: 4, width: 44, height: 44, bgcolor: "rgba(8,8,11,0.78)", color: "text.primary", "&:hover": { bgcolor: "rgba(23,24,32,0.95)" } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}
