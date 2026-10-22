"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import type { TranslationStatus } from "@/lib/curation/translateEngine";
import { adminPanelSx } from "./AdminUi";

const ENGINE_LABEL: Record<TranslationStatus["engine"], string> = {
  libretranslate: "LibreTranslate (instância própria, sem cota)",
  mymemory: "MyMemory (gratuito, com cota diária pequena)",
};

/**
 * Admin → Curadoria → tradução das sinopses: quantas das obras com sinopse já estão em português (e em japonês), qual motor
 * traduz, e o botão que traduz o resto em segundo plano (das mais populares para as menos). Consulta o andamento a cada 2 s
 * enquanto roda.
 */
export function TranslationPanel() {
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tick, setTick] = useState(0);

  const running = status?.job?.state === "RUNNING";
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/translation", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next = (await res.json()) as TranslationStatus;
        if (cancelled) return;
        setStatus(next);
        setError(null);
      } catch {
        if (!cancelled) setError("Não consegui consultar a tradução agora.");
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
      const res = await fetch("/api/admin/translation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: "pt" }) });
      if (res.status !== 202 && res.status !== 409) setError("Não foi possível iniciar a tradução.");
      setTick((n) => n + 1);
    } finally {
      setStarting(false);
    }
  }

  if (!status) return <Typography data-testid="translation-loading">{error ?? "Carregando a tradução…"}</Typography>;

  const progress = status.progress;
  const done = running && progress ? progress.done : status.pt.done;
  const percent = status.pt.total ? Math.min(100, Math.floor((done / status.pt.total) * 100)) : 0;
  const complete = status.pt.total > 0 && status.pt.done >= status.pt.total;

  return (
    <Box component="section" sx={adminPanelSx} data-testid="translation-panel">
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Sinopses em português
          </Typography>
          <Chip size="small" color={running ? "info" : complete ? "success" : "default"} label={running ? "Traduzindo" : complete ? "Todas traduzidas" : "Parada"} data-testid="translation-state" />
        </Stack>
        <Button variant="contained" disabled={running || starting || complete} onClick={() => void start()} data-testid="translation-start">
          {status.pt.done > 0 && !complete ? "Retomar tradução" : "Traduzir as sinopses"}
        </Button>
      </Box>
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography data-testid="translation-count" sx={{ fontSize: 15 }}>
            <strong>{done.toLocaleString("pt-BR")}</strong> de {status.pt.total.toLocaleString("pt-BR")} sinopses
          </Typography>
          <Typography data-testid="translation-percent" sx={{ fontSize: 15, fontWeight: 700 }}>
            {percent}%
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={percent} sx={{ height: 12, borderRadius: 6 }} aria-label="Andamento da tradução" />
        <Typography sx={{ mt: 0.75, fontSize: 13, color: "text.secondary" }} data-testid="translation-note">
          {running ? `${status.job?.progressNote ?? "Traduzindo…"}${progress?.currentTitle ? ` · agora: ${progress.currentTitle}` : ""}` : `Motor: ${ENGINE_LABEL[status.engine]}. Em japonês: ${status.ja.done.toLocaleString("pt-BR")} de ${status.ja.total.toLocaleString("pt-BR")}.`}
        </Typography>
      </Box>
      {!running && progress?.quotaStopped && (
        <Alert severity="warning" data-testid="translation-quota">
          A cota diária do serviço gratuito acabou e a tradução parou em {progress.done.toLocaleString("pt-BR")} sinopses. Dá para retomar amanhã; para traduzir tudo de uma vez, é preciso uma instância própria do LibreTranslate (variável <code>LIBRETRANSLATE_URL</code>).
        </Alert>
      )}
      {!running && progress?.unreachable && <Alert severity="error">O serviço de tradução não respondeu várias vezes seguidas; a tradução foi interrompida. Verifique o serviço e retome.</Alert>}
      {status.job?.state === "FAILED" && status.job.error && <Alert severity="error">A última tradução falhou: {status.job.error}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}
    </Box>
  );
}
