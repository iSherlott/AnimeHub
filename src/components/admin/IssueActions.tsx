"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

/** Ações de uma pendência (Fase 7): resolver (se a condição foi atendida), ignorar com justificativa, reabrir. */
export function IssueActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  async function act(action: string, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/curation/queue/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: reason || null }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? { tone: "ok", text: done } : { tone: "error", text: data.error ?? "Não foi possível." });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
      {status !== "RESOLVED" && <TextField size="small" label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ minWidth: 160 }} slotProps={{ htmlInput: { "data-testid": `issue-reason-${id}` } }} />}
      {status === "OPEN" && (
        <>
          <Button size="small" disabled={busy} sx={ELEVATED_BUTTON_SX} onClick={() => void act("resolve", "Resolvida.")} data-testid={`issue-resolve-${id}`}>
            Resolver
          </Button>
          <Button size="small" disabled={busy} sx={ELEVATED_BUTTON_SX} onClick={() => void act("dismiss", "Ignorada.")} data-testid={`issue-dismiss-${id}`}>
            Ignorar
          </Button>
        </>
      )}
      {status !== "OPEN" && (
        <Button size="small" disabled={busy} sx={ELEVATED_BUTTON_SX} onClick={() => void act("reopen", "Reaberta.")} data-testid={`issue-reopen-${id}`}>
          Reabrir
        </Button>
      )}
      {msg && <Typography role="status" data-testid={`issue-message-${id}`} sx={{ fontSize: 12, color: msg.tone === "ok" ? "success.main" : "error.main" }}>{msg.text}</Typography>}
    </Box>
  );
}
