"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { Box, Button, Chip, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

type Work = { id: string; title: string; year: number | null; kind: string | null; role: string; season: number | null; manual: boolean };

/**
 * Ordem da franquia (Fase 7): o admin move as obras, escolhe o papel e a temporada, vê a linha do tempo resultante e
 * salva. O que salvar fica protegido contra a auditoria automática.
 */
export function FranchiseOrderEditor({ franchiseKey, works, roles }: { franchiseKey: number; works: Work[]; roles: Record<string, string> }) {
  const router = useRouter();
  const [list, setList] = useState(works);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const dirty = useMemo(() => JSON.stringify(list) !== JSON.stringify(works), [list, works]);

  const move = (i: number, d: -1 | 1) =>
    setList((cur) => {
      const next = [...cur];
      const j = i + d;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const set = (i: number, patch: Partial<Work>) => setList((cur) => cur.map((w, k) => (k === i ? { ...w, ...patch } : w)));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const items = list.map((w, i) => ({ id: w.id, timelineOrder: i + 1, timelineRole: w.role, timelineSeason: w.role === "MAIN" ? w.season : null }));
      const res = await fetch(`/api/admin/franchises/${franchiseKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", items, reason: reason || null }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? { tone: "ok", text: `Salvo: ${data.changed} obra(s) com ordem manual.` } : { tone: "error", text: data.error ?? "Não foi possível salvar." });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box component="ol" sx={{ m: 0, pl: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }} data-testid="franchise-order">
        {list.map((w, i) => (
          <Box component="li" key={w.id} data-testid={`franchise-item-${w.id}`} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", border: 1, borderColor: "divider", borderRadius: "8px", p: 1 }}>
            <Typography sx={{ width: 28, fontWeight: 700 }}>{i + 1}</Typography>
            <IconButton size="small" aria-label={`Subir ${w.title}`} disabled={i === 0} onClick={() => move(i, -1)} data-testid={`franchise-up-${w.id}`}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label={`Descer ${w.title}`} disabled={i === list.length - 1} onClick={() => move(i, 1)} data-testid={`franchise-down-${w.id}`}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <a href={`/admin/obras/${w.id}`} style={{ color: "inherit", fontWeight: 600 }}>{w.title}</a>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[w.year, w.kind].filter(Boolean).join(" · ") || "sem data"}</Typography>
            </Box>
            <TextField select size="small" label="Papel" value={w.role} onChange={(e) => set(i, { role: e.target.value })} sx={{ minWidth: 200 }}>
              {Object.entries(roles).map(([v, l]) => (
                <MenuItem key={v} value={v}>{l}</MenuItem>
              ))}
            </TextField>
            {w.role === "MAIN" && <TextField size="small" type="number" label="Temporada" value={w.season ?? ""} onChange={(e) => set(i, { season: e.target.value ? Number(e.target.value) : null })} sx={{ width: 110 }} />}
            {w.manual && <Chip size="small" label="manual" />}
          </Box>
        ))}
      </Box>
      {dirty && (
        <Box data-testid="franchise-preview" sx={{ fontSize: 13, color: "text.secondary" }}>
          Prévia da linha do tempo: {list.map((w) => `${w.title}${w.role === "MAIN" && w.season ? ` (T${w.season})` : w.role === "SPECIAL" ? " (especial)" : ""}`).join(" → ")}
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" label="Motivo (fica no histórico)" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ minWidth: 260 }} />
        <Button disabled={!dirty || busy} variant="contained" onClick={() => void save()} data-testid="franchise-save">
          Salvar ordem
        </Button>
        <Button disabled={!dirty || busy} sx={ELEVATED_BUTTON_SX} onClick={() => setList(works)}>
          Descartar
        </Button>
        {msg && <Typography role="status" data-testid="franchise-message" sx={{ fontSize: 14, color: msg.tone === "ok" ? "success.main" : "error.main" }}>{msg.text}</Typography>}
      </Box>
    </Box>
  );
}

/** Desfazer um salvamento de ordem. */
export function FranchiseUndoButton({ franchiseKey, batchId }: { franchiseKey: number; batchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="small"
      disabled={busy}
      sx={ELEVATED_BUTTON_SX}
      data-testid={`franchise-undo-${batchId}`}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/admin/franchises/${franchiseKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo", batchId }) });
          if (res.ok) router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Desfazer
    </Button>
  );
}
