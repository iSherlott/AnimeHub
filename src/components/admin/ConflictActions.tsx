"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CheckIcon from "@mui/icons-material/Check";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { Box, Button, InputBase, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ErrorNotice } from "@/components/StatePanels";
import { zonedLocalToUtc } from "@/lib/timeZone";

const fieldSx = { px: 2, py: 1.75, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "background.paper", fontSize: 14 } as const;

/**
 * Decisão de um conflito de horário (Figma `8:4327`): "Usar fonte A/B" ou
 * "Definir manualmente" (exige motivo; nunca inventa horário). A decisão grava
 * um override auditável e não apaga os valores de origem.
 */
export function ConflictActions({ conflictId, aSource, bSource, initialLocal, timeZone }: { conflictId: string; aSource: string; bSource: string; initialLocal: string; timeZone: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState(initialLocal);
  const [reason, setReason] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/conflicts/${conflictId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a decisão. Tente novamente.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function manual() {
    const value = zonedLocalToUtc(local, timeZone);
    if (!value) {
      setManualError("Informe uma data e um horário válidos.");
      return;
    }
    if (reason.trim().length < 3) {
      setManualError("Informe o motivo da decisão.");
      return;
    }
    setManualError(null);
    void decide({ resolution: "MANUAL", value: value.toISOString(), reason: reason.trim() });
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <Button variant="contained" startIcon={<CheckIcon />} disabled={busy} onClick={() => void decide({ resolution: "A" })} data-testid="conflict-use-a">
          Usar fonte A ({aSource})
        </Button>
        <Button startIcon={<CheckIcon />} disabled={busy} onClick={() => void decide({ resolution: "B" })} sx={ELEVATED_BUTTON_SX} data-testid="conflict-use-b">
          Usar fonte B ({bSource})
        </Button>
      </Box>

      <Box component="section" aria-labelledby="manual-title" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3, borderRadius: "16px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Typography id="manual-title" component="h2" sx={{ fontSize: 20 }}>
          Definir manualmente
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography component="label" htmlFor="manual-when" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
              Data e horário local
            </Typography>
            <InputBase id="manual-when" type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} sx={{ ...fieldSx, colorScheme: "dark" }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
              Timezone
            </Typography>
            <Typography sx={{ ...fieldSx }}>{timeZone}</Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: "1 1 240px" }}>
            <Typography component="label" htmlFor="manual-reason" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
              Motivo da decisão
            </Typography>
            <InputBase id="manual-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: confirmado na página oficial" sx={fieldSx} inputProps={{ maxLength: 200 }} />
          </Box>
          <Button startIcon={<EditOutlinedIcon />} disabled={busy} onClick={manual} sx={ELEVATED_BUTTON_SX} data-testid="conflict-manual">
            Definir manualmente
          </Button>
        </Box>
        {manualError && (
          <Typography role="alert" sx={{ fontSize: 13, color: "primary.main" }}>
            {manualError}
          </Typography>
        )}
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Exige motivo da decisão. Salvar override não apaga valores de origem. Sem inventar horário se a fonte não informar.</Typography>
      </Box>
      {error && <ErrorNotice title="Não foi possível salvar a decisão.">{error}</ErrorNotice>}
    </Box>
  );
}
