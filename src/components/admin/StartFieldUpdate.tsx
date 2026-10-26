"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

const SOURCE_TEXT = { anilist: "pela AniList", kitsu: "pela Kitsu", anidb: "pelo AniDB" } as const;

/**
 * "Atualizar campos pela AniList / Kitsu / AniDB" (Fase 6): cria um lote de atualização seletiva com as obras do filtro
 * atual (ou com as obras dadas) que têm o identificador daquela fonte e abre a revisão. A coleta não muda nada no catálogo.
 */
export function StartFieldUpdate({ filter, ids, total, label, source = "anilist" }: { filter?: string; ids?: string[]; total: number; label?: string; source?: keyof typeof SOURCE_TEXT }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/field-updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids, label, source } : { filter: filter ?? "", label, source }) });
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
      <Button onClick={() => void start()} disabled={busy || total === 0} sx={ELEVATED_BUTTON_SX} data-testid={source === "anilist" ? "start-field-update" : `start-field-update-${source}`}>
        {busy ? "Criando o lote…" : `Atualizar campos ${SOURCE_TEXT[source]} (${total})`}
      </Button>
      {error && (
        <Typography role="alert" sx={{ fontSize: 13, color: "error.main" }} data-testid="start-field-update-error">
          {error}
        </Typography>
      )}
    </Box>
  );
}
