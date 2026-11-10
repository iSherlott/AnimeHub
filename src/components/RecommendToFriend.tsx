"use client";

import { useState } from "react";
import SendIcon from "@mui/icons-material/Send";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";

type Friend = { id: string; displayName: string; handle: string | null; alreadySent: boolean; follows: boolean };
const NOTE_MAX = 200;

/**
 * "Recomendar a um amigo" (10/11/2026): escolhe um amigo, escreve um bilhete opcional e a recomendação chega no sino
 * dele. Quem já recebeu esta obra de você, ou já acompanha, aparece marcado.
 */
export function RecommendToFriend({ workKey, title }: { workKey: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function openDialog() {
    setOpen(true);
    setError(null);
    setSentTo(null);
    const res = await fetch(`/api/recommendations?obra=${encodeURIComponent(workKey)}`).catch(() => null);
    const data = res && res.ok ? await res.json() : { friends: [] };
    setFriends(data.friends ?? []);
  }

  async function send() {
    if (!to) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, work: workKey, note }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível recomendar agora.");
        return;
      }
      const name = friends?.find((f) => f.id === to)?.displayName ?? "seu amigo";
      setSentTo(name);
      setFriends((list) => list?.map((f) => (f.id === to ? { ...f, alreadySent: true } : f)) ?? null);
      setTo("");
      setNote("");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="outlined" startIcon={<SendIcon />} onClick={() => void openDialog()} data-testid="recommend-open" sx={{ alignSelf: "flex-start" }}>
        Recomendar a um amigo
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="recommend-title">
        <DialogTitle id="recommend-title">Recomendar {title}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
          {friends === null ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Carregando seus amigos…</Typography>
          ) : friends.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Você ainda não tem amigos no AnimeHub. Adicione alguém em Amigos para recomendar obras.</Typography>
          ) : (
            <>
              <TextField
                select
                label="Para quem"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                slotProps={{ htmlInput: { "data-testid": "recommend-friend" } }}
                size="small"
              >
                {friends.map((f) => (
                  <MenuItem key={f.id} value={f.id} disabled={f.alreadySent}>
                    {f.displayName}
                    {f.alreadySent ? " · já recomendado" : f.follows ? " · já acompanha" : ""}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Bilhete (opcional)"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                multiline
                minRows={2}
                size="small"
                helperText={`${note.length}/${NOTE_MAX} · sem spoiler, por favor`}
                slotProps={{ htmlInput: { "data-testid": "recommend-note", maxLength: NOTE_MAX } }}
              />
            </>
          )}
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          {sentTo && (
            <Alert severity="success" role="status" data-testid="recommend-sent">
              Recomendado para {sentTo}.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setOpen(false)}>Fechar</Button>
          <Button variant="contained" onClick={() => void send()} disabled={!to || sending} data-testid="recommend-send">
            {sending ? "Enviando…" : "Recomendar"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
