"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
} from "@mui/material";
import { loginHref } from "@/lib/safeRedirect";
import { POSTS_CHANGED_EVENT } from "@/components/UserPostList";

const MAX_BODY_LENGTH = 500;
const DRAFT_KEY = (anilistId: number) => `anime-hub:draft:${anilistId}`;

/**
 * "Publicar sobre este anime" (Figma `13:42397`, fluxo B): abre o editor com
 * a produção PRÉ-SELECIONADA (não cria acompanhamento nem post automático).
 * Visitante vai ao login e volta com o rascunho preservado (sessionStorage).
 * Cancelar com texto pede confirmação; falha mantém tudo (`13:43375`).
 */
export function PublishAboutButton({ anilistId, loggedIn }: { anilistId: number; loggedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEditor() {
    if (!loggedIn) {
      // Preserva o rascunho do que já foi digitado, se houver, e volta para a seção.
      router.push(loginHref(`/obra/${anilistId}#discussoes`));
      return;
    }
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY(anilistId));
      if (saved) setBody(saved);
    } catch {
      // sessionStorage indisponível — editor abre vazio.
    }
    setOpen(true);
  }

  function requestClose() {
    if (body.trim() && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    discard();
  }

  function discard() {
    setConfirmDiscard(false);
    setOpen(false);
    setBody("");
    setSpoiler(false);
    setError(null);
    try {
      sessionStorage.removeItem(DRAFT_KEY(anilistId));
    } catch {
      // nada a limpar
    }
  }

  async function publish() {
    if (busy) return; // um envio por intenção (sem clique duplo)
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, anilistId, isSpoiler: spoiler }),
      });
      if (!res.ok) throw new Error("falha");
      discard();
      window.dispatchEvent(new Event(POSTS_CHANGED_EVENT));
      router.refresh();
    } catch {
      // Texto, associação e escolha de spoiler foram mantidos.
      try {
        sessionStorage.setItem(DRAFT_KEY(anilistId), body);
      } catch {
        // idem
      }
      setError("Não foi possível publicar. Texto, associação e escolha de spoilers foram mantidos. Você pode tentar novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="contained" size="small" onClick={openEditor} data-testid="publish-about">
        {loggedIn ? "+ Publicar sobre este anime" : "Entre para publicar"}
      </Button>

      <Dialog open={open} onClose={requestClose} fullWidth maxWidth="sm" aria-labelledby="publish-title">
        <DialogTitle id="publish-title">Nova publicação</DialogTitle>
        <DialogContent>
          <Alert severity="info" icon={false} sx={{ mb: 2 }} data-testid="publish-context">
            Sobre esta obra — a associação já está selecionada. Publicar não cria acompanhamento.
          </Alert>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            value={body}
            onChange={(e) => {
              setBody(e.target.value.slice(0, MAX_BODY_LENGTH));
              try {
                sessionStorage.setItem(DRAFT_KEY(anilistId), e.target.value.slice(0, MAX_BODY_LENGTH));
              } catch {
                // sem rascunho persistido — segue funcionando
              }
            }}
            placeholder="Que conversa você quer começar?"
            slotProps={{ htmlInput: { "aria-label": "Sua publicação" } }}
          />
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
            <FormControlLabel
              control={<Checkbox size="small" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />}
              label="Contém spoilers"
              slotProps={{ typography: { variant: "caption" } }}
            />
            <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
              {body.length}/{MAX_BODY_LENGTH}
            </Box>
          </Box>
          {error && (
            <Alert severity="error" role="alert" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={requestClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={publish} disabled={busy || !body.trim()} data-testid="publish-send">
            {busy ? "Publicando…" : "Publicar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} aria-labelledby="discard-title">
        <DialogTitle id="discard-title">Descartar este rascunho?</DialogTitle>
        <DialogContent>Seu texto ainda não foi publicado. Voltar ao editor mantém o que você escreveu.</DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setConfirmDiscard(false)}>
            Continuar escrevendo
          </Button>
          <Button color="error" onClick={discard} data-testid="discard-confirm">
            Descartar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
