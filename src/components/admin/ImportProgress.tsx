"use client";

import { useEffect, useState } from "react";
import { Box, LinearProgress, Typography } from "@mui/material";
import type { JobStage } from "@/lib/adminImport/jobSteps";

/** Nome da etapa para quem acompanha a carga (a análise tem 3 passos; depois vem a aplicação). */
const STAGE_TEXT: Partial<Record<JobStage, string>> = {
  PARSE: "Passo 1 de 3 · Lendo o HTML",
  NORMALIZE: "Passo 2 de 3 · Buscando a temporada na AniList",
  MATCHING: "Passo 3 de 3 · Comparando com o catálogo",
  COMMIT: "Aplicando ao catálogo",
};

type Progress = { active: boolean; seq?: number; stage?: JobStage; total?: number; processed?: number; note?: string | null };

/**
 * Andamento da carga enquanto ela roda: etapa, frase do que está sendo feito e barra (com "x de N" quando o total é
 * conhecido). Consulta `/api/admin/imports/progress` a cada segundo — por `seq` (commit, reaplicar) ou, na análise, pelo
 * lote que a pessoa acabou de iniciar (`since`).
 */
export function ImportProgress({ running, seq, since, fallbackNote, kind = "IMPORT", title }: { running: boolean; seq?: number; since?: number; fallbackNote: string; kind?: "IMPORT" | "ANILIST"; title?: string }) {
  const [progress, setProgress] = useState<Progress>({ active: false });

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const query = seq ? `seq=${seq}` : `since=${since ?? Date.now()}&kind=${kind}`;
    async function poll() {
      try {
        const res = await fetch(`/api/admin/imports/progress?${query}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        setProgress((await res.json()) as Progress);
      } catch {
        /* o próximo ciclo tenta de novo */
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [running, seq, since, kind]);

  if (!running) return null;
  const known = Boolean(progress.total && progress.total > 0 && progress.processed !== undefined && progress.stage && (Boolean(title) || progress.stage === "MATCHING" || progress.stage === "COMMIT"));
  const percent = known ? Math.min(100, Math.round(((progress.processed ?? 0) / (progress.total as number)) * 100)) : null;
  return (
    <Box role="status" aria-live="polite" data-testid="import-progress" sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2, borderRadius: "12px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography data-testid="import-progress-stage" sx={{ fontSize: 14, fontWeight: 700 }}>
          {title ?? (progress.stage ? (STAGE_TEXT[progress.stage] ?? progress.stage) : "Iniciando")}
        </Typography>
        {percent !== null && (
          <Typography data-testid="import-progress-percent" sx={{ fontSize: 14, color: "text.secondary" }}>
            {percent}%
          </Typography>
        )}
      </Box>
      <LinearProgress variant={percent === null ? "indeterminate" : "determinate"} value={percent ?? undefined} aria-label="Andamento da carga" />
      <Typography data-testid="import-progress-note" sx={{ fontSize: 13, color: "text.secondary" }}>
        {progress.note ?? fallbackNote}
      </Typography>
    </Box>
  );
}
