"use client";

import CloseIcon from "@mui/icons-material/Close";
import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";

export type ComposerImage = {
  localId: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  uploadedUrl?: string;
  error?: string;
};

/**
 * Miniaturas de imagem anexada no compositor (Epic 26) — só a fileira de
 * miniaturas; o botão de anexar em si vive na barra de baixo do
 * compositor (FeedView.tsx), junto do contador de caracteres e do botão
 * "Publicar", estilo Twitter. Cada miniatura sobe de forma independente
 * (ver handleAddImages em FeedView.tsx), então cada uma mostra seu
 * próprio estado: enviando, pronta, ou falha com um jeito de tentar de
 * novo sem perder as outras já enviadas.
 */
export function ComposerImageAttachments({
  images,
  onRemove,
  onRetry,
}: {
  images: ComposerImage[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}) {
  if (images.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
      {images.map((img) => (
        <Box
          key={img.localId}
          sx={{
            position: "relative",
            width: 88,
            height: 88,
            borderRadius: 2,
            overflow: "hidden",
            flexShrink: 0,
            bgcolor: "background.default",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.previewUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />

          <Tooltip title="Remover">
            <IconButton
              onClick={() => onRemove(img.localId)}
              size="small"
              aria-label="Remover imagem"
              sx={{
                position: "absolute",
                top: 2,
                right: 2,
                bgcolor: "rgba(0,0,0,0.6)",
                color: "#fff",
                "&:hover": { bgcolor: "rgba(0,0,0,0.8)" },
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>

          {img.status === "uploading" && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(0,0,0,0.35)",
              }}
            >
              <CircularProgress size={22} sx={{ color: "#fff" }} />
            </Box>
          )}

          {img.status === "error" && (
            <Box
              onClick={() => onRetry(img.localId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onRetry(img.localId);
              }}
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(180,0,0,0.55)",
                cursor: "pointer",
                textAlign: "center",
                p: 0.5,
              }}
            >
              <Typography variant="caption" sx={{ color: "#fff", fontWeight: 600 }}>
                Falhou
                <br />
                Tentar de novo
              </Typography>
            </Box>
          )}
        </Box>
      ))}
    </Stack>
  );
}
