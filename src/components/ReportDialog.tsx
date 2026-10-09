"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Snackbar,
} from "@mui/material";
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason, type ReportTargetKind } from "@/lib/reportReasons";

export type ReportTarget =
  | { kind: "post"; id: string }
  | { kind: "comment"; id: string; postId: string }
  | { kind: "profile"; id: string };

function endpointFor(target: ReportTarget): string {
  if (target.kind === "post") return `/api/posts/${target.id}/report`;
  if (target.kind === "comment") return `/api/posts/${target.postId}/comments/${target.id}/report`;
  return `/api/users/${target.id}/report`;
}

const KIND_NOUN: Record<ReportTargetKind, string> = {
  post: "desta publicação",
  comment: "deste comentário",
  profile: "deste perfil",
};

/**
 * Fluxo de denúncia do Figma (`13:43571`, fluxo G): 1) motivo (obrigatório,
 * "Continuar" desativado sem escolha) → 2) confirmação "Enviar denúncia
 * deste …?" → 3) retorno discreto "Denúncia enviada." Cancelar/Esc volta ao
 * ponto de origem sem enviar; falha mantém o motivo para tentar de novo.
 * Denunciar NÃO bloqueia o perfil e a identidade não é divulgada.
 */
export function ReportDialog({
  open,
  onClose,
  target,
  targetLabel,
  onReported,
}: {
  open: boolean;
  onClose: () => void;
  target: ReportTarget;
  targetLabel: string;
  onReported?: () => void;
}) {
  const [step, setStep] = useState<"reason" | "confirm">("reason");
  const [reason, setReason] = useState<ReportReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Cada abertura recomeça do passo do motivo.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("reason");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpointFor(target), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("falha");
      setSent(true);
      setReason("");
      onClose();
      onReported?.();
    } catch {
      setError("Não foi possível enviar a denúncia. O motivo foi mantido; tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={() => (busy ? undefined : onClose())}
        aria-labelledby="report-title"
        fullWidth
        maxWidth="xs"
      >
        {step === "reason" ? (
          <>
            <DialogTitle id="report-title">Denunciar {targetLabel}</DialogTitle>
            <DialogContent>
              <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ mb: 1 }}>
                  O que aconteceu?
                </FormLabel>
                <RadioGroup value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} name="reason">
                  {REPORT_REASONS.map((r) => (
                    <FormControlLabel key={r} value={r} control={<Radio />} label={REPORT_REASON_LABELS[r]} />
                  ))}
                </RadioGroup>
              </FormControl>
              <DialogContentText variant="caption" sx={{ mt: 1 }}>
                Não inclua dados pessoais. O autor não verá quem denunciou.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={onClose}>Cancelar</Button>
              <Button variant="contained" disabled={!reason} onClick={() => setStep("confirm")} data-testid="report-continue">
                Continuar
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle id="report-title">Enviar denúncia {KIND_NOUN[target.kind]}?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                A equipe poderá revisar o contexto. Sua identidade não será publicada. Denunciar não bloqueia
                automaticamente o perfil.
              </DialogContentText>
              {error && (
                <Alert severity="error" role="alert" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button autoFocus onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button variant="contained" onClick={submit} disabled={busy} data-testid="report-send">
                {busy ? "Enviando…" : "Enviar denúncia"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      <Snackbar
        open={sent}
        autoHideDuration={5000}
        onClose={() => setSent(false)}
        message="Denúncia enviada. Obrigado por ajudar a cuidar da comunidade."
        slotProps={{ content: { role: "status" } }}
      />
    </>
  );
}
