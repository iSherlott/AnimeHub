"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

type Impact = { followers: number; futureEpisodes: number; productions: number; posts: number };

/**
 * Publicar ou despublicar a obra (Fase 3). Não existe "excluir": tirar da plataforma esconde a obra sem apagar nada
 * (cópias, agenda, listas e publicações continuam no banco). Antes de confirmar, o admin vê quem é afetado e diz o motivo.
 */
export function WorkVisibilityControl({ id, onPlatform }: { id: string; onPlatform: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDialog() {
    setError(null);
    setOpen(true);
    if (onPlatform) {
      const res = await fetch(`/api/admin/works/${id}/visibility`, { cache: "no-store" });
      if (res.ok) setImpact(await res.json());
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/works/${id}/visibility`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onPlatform: !onPlatform, reason }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível alterar.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => void openDialog()} sx={ELEVATED_BUTTON_SX} data-testid="work-visibility">
        {onPlatform ? "Tirar da plataforma" : "Publicar na plataforma"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{onPlatform ? "Tirar a obra da plataforma?" : "Publicar a obra?"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {onPlatform ? (
            <>
              <Typography>A obra deixa de aparecer na busca, no Explorar, no calendário e na página pública. Nada é apagado: dá para publicar de novo.</Typography>
              {impact && (
                <Box component="ul" data-testid="work-visibility-impact" sx={{ m: 0, pl: 3 }}>
                  <li>{impact.followers} pessoa(s) acompanham (continua na lista delas, sem página para abrir)</li>
                  <li>{impact.futureEpisodes} episódio(s) futuros saem do calendário</li>
                  <li>{impact.productions} página(s) pública(s) deixam de abrir</li>
                  <li>{impact.posts} publicação(ões) da Comunidade citam a obra</li>
                </Box>
              )}
            </>
          ) : (
            <Typography>A obra volta a aparecer em busca, Explorar, calendário e página pública.</Typography>
          )}
          <TextField label={onPlatform ? "Motivo (obrigatório)" : "Motivo (opcional)"} value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500, "data-testid": "work-visibility-reason" } }} />
          {error && <Typography sx={{ color: "error.main", fontSize: 14 }}>{error}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} autoFocus>
            Cancelar
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || (onPlatform && !reason.trim())} variant="contained" data-testid="work-visibility-confirm">
            {onPlatform ? "Tirar da plataforma" : "Publicar"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
