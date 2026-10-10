"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";

/**
 * Edição do perfil (PROF-001/002; Figma `13:42736`): nome de exibição,
 * @identificador e bio. O identificador é único: o servidor devolve 409
 * quando já existe, e a mensagem aparece aqui sem perder o que foi digitado.
 */
export function ProfileEditDialog({ displayName, handle, bio }: { displayName: string; handle: string | null; bio: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [id, setId] = useState(handle ?? "");
  const [about, setAbout] = useState(bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openDialog() {
    setName(displayName);
    setId(handle ?? "");
    setAbout(bio ?? "");
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, string> = { displayName: name, bio: about };
      if (id.trim()) payload.handle = id;
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Não foi possível salvar. Tente de novo.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={openDialog} data-testid="profile-edit-open" sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
        Editar perfil
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="profile-edit-title">
        <DialogTitle id="profile-edit-title">Editar perfil</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} fullWidth />
            <TextField
              label="Identificador"
              value={id}
              onChange={(e) => setId(e.target.value)}
              helperText="3 a 20 caracteres: letras sem acento, números e _. Aparece como @identificador."
              slotProps={{ htmlInput: { maxLength: 21 } }}
              fullWidth
            />
            <TextField
              label="Bio"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="uma frase sobre você (opcional)"
              multiline
              minRows={2}
              maxRows={5}
              slotProps={{ htmlInput: { maxLength: 300 } }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save} disabled={busy || !name.trim()} data-testid="profile-edit-save">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
