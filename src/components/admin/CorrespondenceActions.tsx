"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

type Action = "confirm" | "reject" | "later" | "new" | "relink";

/**
 * Decisão sobre uma correspondência (Fase 6): confirmar, rejeitar, ligar a outra obra, manter como obra nova ou deixar
 * para depois. Quando há risco (similaridade baixa, ano ou formato diferente), confirmar exige motivo.
 */
export function CorrespondenceActions({ kind, id, risky, pending, allowLater }: { kind: "import" | "anidb"; id: string; risky: boolean; pending: boolean; allowLater: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function decide(action: Action) {
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { action, reason: reason || null };
      if (action === "relink") {
        if (kind === "anidb") body.anilistId = target.trim();
        else body.productionId = target.trim();
      }
      const res = await fetch(`/api/admin/correspondences/${kind}/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "Não foi possível salvar." });
        return;
      }
      setMessage({ tone: "ok", text: "Decisão registrada." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!pending) return <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Esta correspondência já foi decidida. A decisão está no histórico abaixo.</Typography>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <TextField label={risky ? "Motivo (obrigatório para confirmar: há risco)" : "Motivo (opcional)"} value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500, "data-testid": "correspondence-reason" } }} />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button onClick={() => void decide("confirm")} disabled={busy} variant="contained" data-testid="correspondence-confirm">
          Confirmar correspondência
        </Button>
        <Button onClick={() => void decide("reject")} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="correspondence-reject">
          Rejeitar
        </Button>
        <Button onClick={() => void decide("new")} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="correspondence-new">
          É outra obra (manter separada)
        </Button>
        {allowLater && (
          <Button onClick={() => void decide("later")} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="correspondence-later">
            Revisar depois
          </Button>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
        <TextField label={kind === "anidb" ? "Ligar a outra obra (AniList ID)" : "Ligar a outro registro (ID da produção)"} value={target} onChange={(e) => setTarget(e.target.value)} sx={{ minWidth: 260 }} slotProps={{ htmlInput: { "data-testid": "correspondence-target" } }} />
        <Button onClick={() => void decide("relink")} disabled={busy || !target.trim()} sx={ELEVATED_BUTTON_SX} data-testid="correspondence-relink">
          Ligar a esta
        </Button>
      </Box>
      {message && (
        <Typography role="status" data-testid="correspondence-message" sx={{ fontSize: 14, color: message.tone === "ok" ? "success.main" : "error.main" }}>
          {message.text}
        </Typography>
      )}
    </Box>
  );
}
