"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

/**
 * "Atualizar campos pela AniList" (Fase 6): cria um lote de atualização seletiva com as obras do filtro atual (ou com
 * as obras dadas) e abre a revisão. A coleta não muda nada no catálogo.
 */
export function StartFieldUpdate({ filter, ids, total, label }: { filter?: string; ids?: string[]; total: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/field-updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids, label } : { filter: filter ?? "", label }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível criar o lote.");
        return;
      }
      router.push(`/admin/atualizacoes/${data.seq}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Button onClick={() => void start()} disabled={busy || total === 0} sx={ELEVATED_BUTTON_SX} data-testid="start-field-update">
        {busy ? "Coletando na AniList…" : `Atualizar campos pela AniList (${total})`}
      </Button>
      {error && (
        <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }} data-testid="start-field-update-error">
          {error}
        </Typography>
      )}
    </Box>
  );
}
