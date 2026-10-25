"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Typography } from "@mui/material";

/** Cancelar um job em execução (Fase 8): cooperativo — ele para no próximo passo; o que já foi gravado fica. */
export function CancelJobButton({ seq }: { seq: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${seq}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Cancelamento pedido: o job para no próximo passo." : (data.error ?? "Não foi possível cancelar."));
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      {confirming ? (
        <>
          <Typography sx={{ fontSize: 14 }}>Parar este job? O que já foi gravado fica; rodar de novo continua daí.</Typography>
          <Button color="error" variant="outlined" disabled={busy} onClick={() => void cancel()} data-testid="job-cancel-confirm">
            Parar
          </Button>
          <Button onClick={() => setConfirming(false)} autoFocus>
            Voltar
          </Button>
        </>
      ) : (
        <Button color="error" variant="outlined" onClick={() => setConfirming(true)} data-testid="job-cancel">
          Cancelar job
        </Button>
      )}
      {msg && <Typography role="status" data-testid="job-cancel-message" sx={{ fontSize: 14 }}>{msg}</Typography>}
    </Box>
  );
}
