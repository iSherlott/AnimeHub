"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

type Msg = { tone: "ok" | "error"; text: string } | null;

/** Busca os episódios de UMA obra no AniDB agora (detalhe da obra). */
export function FetchAnidbEpisodesButton({ workId }: { workId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/works/${workId}/anidb-episodes`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? { tone: "ok", text: `${data.found} episódio(s) no AniDB; ${data.written} gravado(s) ou completado(s); ${data.extras} extra(s).` } : { tone: "error", text: data.error ?? "Não foi possível." });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Button onClick={() => void run()} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="work-anidb-episodes">
        {busy ? "Consultando o AniDB…" : "Buscar episódios no AniDB"}
      </Button>
      {msg && <Typography role="status" data-testid="work-anidb-episodes-message" sx={{ fontSize: 13, color: msg.tone === "ok" ? "success.main" : "error.main" }}>{msg.text}</Typography>}
    </Box>
  );
}

/**
 * Lote: episódios das obras só do AniDB (Admin → Episódios). Um lote por vez; o AniDB limita as consultas, então ele
 * espera entre uma obra e outra e pode levar alguns minutos — o andamento fica em Admin → Jobs.
 */
export function AnidbEpisodesBatch({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [limit, setLimit] = useState("100");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/anidb-episodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: Number(limit) || 100 }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? { tone: "ok", text: `Lote #${data.seq} iniciado: acompanhe em Admin → Jobs.` } : { tone: "error", text: data.error ?? "Não foi possível iniciar." });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <TextField size="small" type="number" label="Obras no lote" value={limit} onChange={(e) => setLimit(e.target.value)} sx={{ width: 140 }} slotProps={{ htmlInput: { min: 1, max: 300, "data-testid": "anidb-batch-limit" } }} />
      <Button onClick={() => void run()} disabled={busy || disabled} sx={ELEVATED_BUTTON_SX} data-testid="anidb-batch-start">
        Buscar no AniDB
      </Button>
      {msg && <Typography role="status" data-testid="anidb-batch-message" sx={{ fontSize: 13, color: msg.tone === "ok" ? "success.main" : "error.main" }}>{msg.text}</Typography>}
    </Box>
  );
}
