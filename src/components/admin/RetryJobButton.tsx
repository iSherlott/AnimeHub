"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReplayIcon from "@mui/icons-material/Replay";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

/** "Tentar novamente" de um job com falha: gera OUTRO job com o mesmo HTML e preserva a auditoria da falha. */
export function RetryJobButton({ seq }: { seq: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/imports/${seq}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível tentar novamente.");
        if (data.seq) router.push(`/admin/jobs/${data.seq}`);
        return;
      }
      router.push(`/admin/importacoes/${data.seq}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box>
        <Button startIcon={<ReplayIcon />} onClick={() => void retry()} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="retry-job">
          {busy ? "Tentando…" : "Tentar novamente"}
        </Button>
      </Box>
      {error && (
        <Typography role="alert" sx={{ fontSize: 13, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
