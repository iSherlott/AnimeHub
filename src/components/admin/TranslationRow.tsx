"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

/**
 * Uma sinopse em revisão (Fase 7): o original ao lado da tradução, com aprovar, rejeitar, editar e traduzir de novo.
 * Revisada e manual não são traduzidas de novo sem rejeitar antes.
 */
export function TranslationRow({ id, title, original, pt, state, source, reviewedBy }: { id: string; title: string; original: string; pt: string | null; state: string; source: string | null; reviewedBy: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(pt ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const protectedState = state === "revisada" || state === "manual";

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/translations/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? { tone: "ok", text: done } : { tone: "error", text: data.error ?? "Não foi possível." });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="li" data-testid={`translation-${id}`} data-state={state} sx={{ border: 1, borderColor: "divider", borderRadius: "10px", p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline", flexWrap: "wrap" }}>
        <a href={`/admin/obras/${id}`} style={{ color: "inherit", fontWeight: 700 }}>{title}</a>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[state, source && `fonte: ${source}`, reviewedBy && `por ${reviewedBy}`].filter(Boolean).join(" · ")}</Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>Original</Typography>
          <Typography lang="en" sx={{ fontSize: 13, whiteSpace: "pre-line" }}>{original || "—"}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>Português</Typography>
          {editing ? (
            <TextField value={text} onChange={(e) => setText(e.target.value)} multiline minRows={4} fullWidth slotProps={{ htmlInput: { "data-testid": `translation-text-${id}` } }} />
          ) : (
            <Typography lang="pt" sx={{ fontSize: 13, whiteSpace: "pre-line" }}>{pt ?? "—"}</Typography>
          )}
        </Box>
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        {state === "automatica" && (
          <Button size="small" disabled={busy} sx={ELEVATED_BUTTON_SX} onClick={() => void act({ action: "approve" }, "Aprovada.")} data-testid={`translation-approve-${id}`}>
            Aprovar
          </Button>
        )}
        {editing ? (
          <Button size="small" disabled={busy || !text.trim()} variant="contained" onClick={() => void act({ action: "edit", text }, "Salva como manual.")} data-testid={`translation-save-${id}`}>
            Salvar
          </Button>
        ) : (
          <Button size="small" disabled={busy} sx={ELEVATED_BUTTON_SX} onClick={() => setEditing(true)} data-testid={`translation-edit-${id}`}>
            {pt ? "Editar" : "Escrever"}
          </Button>
        )}
        {pt && (
          <>
            <TextField size="small" label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="small" disabled={busy} sx={ELEVATED_BUTTON_SX} onClick={() => void act({ action: "reject", reason }, "Rejeitada: volta para pendente.")} data-testid={`translation-reject-${id}`}>
              Rejeitar
            </Button>
          </>
        )}
        {original && !protectedState && (
          <Button size="small" disabled={busy} sx={ELEVATED_BUTTON_SX} onClick={() => void act({ action: "retranslate" }, "Traduzida de novo.")} data-testid={`translation-retranslate-${id}`}>
            Traduzir de novo
          </Button>
        )}
        {msg && <Typography role="status" data-testid={`translation-message-${id}`} sx={{ fontSize: 13, color: msg.tone === "ok" ? "success.main" : "error.main" }}>{msg.text}</Typography>}
      </Box>
    </Box>
  );
}
