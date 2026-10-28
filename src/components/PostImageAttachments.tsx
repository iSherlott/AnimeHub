"use client";

import { useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from "@mui/material";
import { MAX_IMAGE_ALT_LENGTH, type PostImage } from "@/lib/usePostImages";

/** Arranjo do X num bloco 16:9 fixo: 1 inteira; 2 lado a lado; 3 com uma alta à esquerda e duas empilhadas; 4 em 2×2. */
function cellSx(count: number, index: number) {
  if (count === 3 && index === 0) return { gridRow: "1 / span 2" };
  return {};
}

const chipSx = {
  minHeight: 32,
  minWidth: 44,
  px: 1,
  borderRadius: "6px",
  bgcolor: "rgba(8,8,11,0.78)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.04em",
  "&:hover": { bgcolor: "rgba(23,24,32,0.95)" },
  "&.Mui-focusVisible": { outline: "2px solid #ffd400", outlineOffset: 2 },
} as const;

/** "Descrever imagem" (como o ALT do X): a imagem grande e o texto que o leitor de tela vai ler. */
function DescribeDialog({ item, index, onSave, onClose }: { item: PostImage; index: number; onSave: (alt: string) => void; onClose: () => void }) {
  const [text, setText] = useState(item.alt);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="describe-image-title">
      <DialogTitle id="describe-image-title">Descrever imagem {index + 1}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ borderRadius: "12px", overflow: "hidden", bgcolor: "#171820", maxHeight: 280, display: "grid", placeItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou imagem enviada. */}
          <img src={item.preview} alt="" style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain", display: "block" }} />
        </Box>
        <TextField
          label="Descrição"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_IMAGE_ALT_LENGTH))}
          multiline
          minRows={3}
          autoFocus
          fullWidth
          helperText={`${text.length}/${MAX_IMAGE_ALT_LENGTH} · Conte o que a imagem mostra para quem usa leitor de tela (e para quem tocar no selo ALT).`}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            onSave(text.trim());
            onClose();
          }}
        >
          Salvar descrição
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Miniaturas das imagens de uma publicação nova, no arranjo do X: o bloco tem sempre a mesma altura (16:9), não importa
 * quantas imagens, para o campo não crescer. Cada uma tem o X para remover, a roda enquanto envia, o aviso se falhou e
 * o botão ALT para escrever a descrição (texto alternativo) — "ALT ✓" quando já tem uma.
 */
export function PostImageAttachments({
  items,
  onRemove,
  onAltChange,
  disabled = false,
}: {
  items: PostImage[];
  onRemove: (id: string) => void;
  onAltChange?: (id: string, alt: string) => void;
  disabled?: boolean;
}) {
  const [describing, setDescribing] = useState<string | null>(null);
  if (items.length === 0) return null;
  const count = items.length;
  const describingIndex = items.findIndex((i) => i.id === describing);
  return (
    <>
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
            <img src={item.preview} alt={item.alt || `Imagem ${i + 1} de ${count}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: item.status === "done" ? 1 : 0.5 }} />
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
            {onAltChange && item.status !== "error" && (
              <ButtonBase
                onClick={() => setDescribing(item.id)}
                disabled={disabled}
                aria-haspopup="dialog"
                aria-label={item.alt ? `Editar a descrição da imagem ${i + 1}` : `Descrever a imagem ${i + 1}`}
                data-testid="describe-image"
                sx={{ ...chipSx, position: "absolute", left: 6, bottom: 6 }}
              >
                {item.alt ? "ALT ✓" : "+ ALT"}
              </ButtonBase>
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
      {onAltChange && describingIndex >= 0 && (
        <DescribeDialog item={items[describingIndex]} index={describingIndex} onSave={(alt) => onAltChange(items[describingIndex].id, alt)} onClose={() => setDescribing(null)} />
      )}
    </>
  );
}
