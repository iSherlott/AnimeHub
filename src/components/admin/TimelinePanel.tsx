"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import type { TimelineStatus } from "@/lib/curation/timelineAudit";
import { adminPanelSx } from "./AdminUi";

const PHASE_LABEL: Record<string, string> = {
  names: "Conferindo os nomes",
  timeline: "Montando as linhas do tempo",
  duplicates: "Procurando obras repetidas",
  issues: "Gravando as pendências",
  done: "Concluída",
};

const fmt = (n: number) => n.toLocaleString("pt-BR");

/**
 * Admin → Curadoria → linhas do tempo: passa por todas as obras, franquia por franquia, põe séries, OVA, ODA e filmes em ordem
 * cronológica, confere os nomes e aponta obras repetidas. Mostra o progresso (consulta a cada 2 s enquanto roda) e o que
 * sobrou para uma pessoa conferir; as pendências aparecem na lista de motivos logo abaixo.
 */
export function TimelinePanel() {
  const [status, setStatus] = useState<TimelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tick, setTick] = useState(0);

  const running = status?.job?.state === "RUNNING";
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/timeline", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next = (await res.json()) as TimelineStatus;
        if (cancelled) return;
        setStatus(next);
        setError(null);
      } catch {
        if (!cancelled) setError("Não consegui consultar a auditoria agora.");
      }
    }
    void load();
    if (!running && !starting) return () => { cancelled = true; };
    const timer = setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [running, starting, tick]);

  async function start() {
    setStarting(true);
    try {
      const res = await fetch("/api/admin/timeline", { method: "POST" });
      if (res.status !== 202 && res.status !== 409) setError("Não foi possível iniciar a auditoria.");
      setTick((n) => n + 1);
    } finally {
      setStarting(false);
    }
  }

  if (!status) return <Typography data-testid="timeline-loading">{error ?? "Carregando as linhas do tempo…"}</Typography>;

  const progress = status.progress;
  const live = running && progress;
  const total = live ? (progress.phase === "names" ? progress.entries : progress.franchises) : 0;
  const doneNow = live ? (progress.phase === "names" ? progress.namesChecked : progress.franchisesDone) : 0;
  const percent = live ? (total ? Math.min(100, Math.floor((doneNow / total) * 100)) : 0) : status.entries ? Math.floor((status.placed / status.entries) * 100) : 0;
  const shown = live ? progress : progress?.finished ? progress : null;

  return (
    <Box component="section" sx={adminPanelSx} data-testid="timeline-panel">
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Linhas do tempo, nomes e repetidas
          </Typography>
          <Chip size="small" color={running ? "info" : status.placed > 0 ? "success" : "default"} label={running ? (PHASE_LABEL[progress?.phase ?? "names"] ?? "Rodando") : status.placed > 0 ? "Auditada" : "Não feita"} data-testid="timeline-state" />
        </Stack>
        <Button variant="contained" disabled={running || starting} onClick={() => void start()} data-testid="timeline-start">
          {status.placed > 0 ? "Auditar de novo" : "Montar as linhas do tempo"}
        </Button>
      </Box>
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography data-testid="timeline-count" sx={{ fontSize: 15 }}>
            {live ? (
              <>
                <strong>{fmt(doneNow)}</strong> de {fmt(total)} {progress.phase === "names" ? "obras" : "franquias"}
              </>
            ) : (
              <>
                <strong>{fmt(status.placed)}</strong> de {fmt(status.entries)} obras com posição em {fmt(status.franchises)} franquias
              </>
            )}
          </Typography>
          <Typography data-testid="timeline-percent" sx={{ fontSize: 15, fontWeight: 700 }}>
            {percent}%
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={percent} sx={{ height: 12, borderRadius: 6 }} aria-label="Andamento da auditoria das linhas do tempo" />
        <Typography sx={{ mt: 0.75, fontSize: 13, color: "text.secondary" }} data-testid="timeline-note">
          {running ? `${status.job?.progressNote ?? "Auditando…"}${progress?.currentTitle ? ` · agora: ${progress.currentTitle}` : ""}` : "Cada obra recebe a posição na franquia (série, OVA, ODA, filme) e a temporada na linha principal."}
        </Typography>
      </Box>
      {shown && (
        <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1 }} data-testid="timeline-summary">
          <Chip size="small" label={`Linha principal: ${fmt(shown.main)}`} />
          <Chip size="small" label={`Outras séries ligadas: ${fmt(shown.related)}`} />
          <Chip size="small" label={`OVA, ODA, filmes e outros: ${fmt(shown.specials)}`} />
          <Chip size="small" color={shown.namesFixed ? "success" : "default"} label={`Nomes corrigidos: ${fmt(shown.namesFixed)}`} />
          <Chip size="small" color={shown.namesInvalid ? "warning" : "default"} label={`Nomes para conferir: ${fmt(shown.namesInvalid)}`} />
          <Chip size="small" color={shown.duplicateGroups ? "warning" : "default"} label={`Grupos de obras repetidas: ${fmt(shown.duplicateGroups)}`} />
          <Chip size="small" color={shown.undated || shown.conflicts ? "warning" : "default"} label={`Sem data: ${fmt(shown.undated)} · Ordem contraditória: ${fmt(shown.conflicts)}`} />
        </Stack>
      )}
      {status.job?.state === "FAILED" && status.job.error && <Alert severity="error">A última auditoria falhou: {status.job.error}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}
    </Box>
  );
}
