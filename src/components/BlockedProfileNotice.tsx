"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BlockIcon from "@mui/icons-material/Block";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

/**
 * Estado "Este perfil está bloqueado" (Figma `13:43571`): nada de bio,
 * publicações ou listas por trás do bloqueio. Desbloquear tem confirmação e
 * NÃO volta a seguir automaticamente.
 */
export function BlockedProfileNotice({ userId, displayName }: { userId: string; displayName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unblock() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/block`, { method: "DELETE" });
      if (!res.ok) throw new Error("falha");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Não foi possível desbloquear. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box data-testid="blocked-profile" sx={{ textAlign: "center", py: 6 }}>
      <Stack spacing={1.5} sx={{ alignItems: "center" }}>
        <BlockIcon fontSize="large" aria-hidden />
        <Typography variant="h5" component="h1">
          Este perfil está bloqueado
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          O conteúdo deste perfil não é exibido para você.
        </Typography>
        <Button variant="outlined" onClick={() => setOpen(true)}>
          Desbloquear perfil
        </Button>
      </Stack>

      <Dialog open={open} onClose={() => (busy ? undefined : setOpen(false))} aria-labelledby="unblock-title">
        <DialogTitle id="unblock-title">Desbloquear {displayName}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Você poderá voltar a ver o conteúdo público deste perfil. Ele não será seguido automaticamente.
          </DialogContentText>
          {error && (
            <Alert severity="error" role="alert" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={unblock} disabled={busy} data-testid="unblock-confirm">
            {busy ? "Desbloqueando…" : "Desbloquear"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
