"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { Box, Button, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import type { Diagnosis } from "@/lib/calendarDiagnosis";

/**
 * "Por que não apareceu na agenda?" (Fase 5): o admin informa a obra (e, se quiser, a pessoa) e vê as verificações do
 * calendário e do sino uma a uma. A pessoa vai no corpo do pedido, nunca no endereço. Daqui dá para reler a agenda da
 * obra na AniList (uma vez a cada 2 minutos).
 */
export function CalendarInvestigator({ initialWork = "" }: { initialWork?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialWork);
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [reload, setReload] = useState<string | null>(null);

  async function investigate() {
    setBusy(true);
    setError(null);
    setReload(null);
    try {
      const res = await fetch("/api/admin/calendar/diagnose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, user: person || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível investigar.");
        return;
      }
      setResult(data as Diagnosis);
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  async function reloadWork(workId: string) {
    setBusy(true);
    setReload(null);
    try {
      const res = await fetch("/api/admin/calendar/reload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workId }) });
      const data = await res.json().catch(() => ({}));
      setReload(res.ok ? `Agenda relida: ${data.episodes} episódio(s) da AniList.` : (data.error ?? "Não foi possível reler."));
      if (res.ok) {
        router.refresh();
        await investigate();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box component="form" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void investigate(); }} sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start" }}>
        <TextField label="Obra (título ou AniList ID)" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 260, flex: 1 }} slotProps={{ htmlInput: { "data-testid": "investigate-work" } }} />
        <TextField label="Pessoa (opcional: @ ou e-mail)" value={person} onChange={(e) => setPerson(e.target.value)} sx={{ minWidth: 220 }} slotProps={{ htmlInput: { "data-testid": "investigate-user" } }} />
        <Button type="submit" disabled={busy || !q.trim()} sx={ELEVATED_BUTTON_SX} data-testid="investigate-run">
          {busy ? "Verificando…" : "Investigar"}
        </Button>
      </Box>
      {error && <Typography role="alert" sx={{ fontSize: 14, color: "error.main" }}>{error}</Typography>}
      {result && (
        <Box data-testid="investigate-result" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {result.work && (
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
              {result.work.title}
              {result.work.anilistId !== null ? ` · AniList ${result.work.anilistId}` : ""}
            </Typography>
          )}
          <Typography data-testid="investigate-conclusion" sx={{ fontSize: 14, p: 1.5, borderRadius: "8px", border: 1, borderColor: "divider" }}>
            {result.conclusion}
          </Typography>
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
            {result.checks.map((c) => (
              <Box component="li" key={c.key} data-testid={`check-${c.key}`} data-ok={c.ok} sx={{ display: "flex", gap: 1, alignItems: "flex-start", fontSize: 14 }}>
                {c.ok ? <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: "success.main", mt: "2px" }} /> : <ErrorOutlineIcon sx={{ fontSize: 18, color: "warning.main", mt: "2px" }} />}
                <span>
                  <strong>{c.label}</strong> — {c.detail}
                  {c.href && (
                    <>
                      {" "}
                      <a href={c.href} style={{ color: "inherit" }}>
                        abrir
                      </a>
                    </>
                  )}
                </span>
              </Box>
            ))}
          </Box>
          {result.work && result.work.anilistId !== null && (
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
              <Button onClick={() => void reloadWork(result.work!.id)} disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="investigate-reload">
                Reler a agenda desta obra
              </Button>
              {reload && <Typography role="status" sx={{ fontSize: 14 }} data-testid="investigate-reload-message">{reload}</Typography>}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
