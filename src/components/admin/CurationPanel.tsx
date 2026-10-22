"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { KIND_LABELS } from "@/lib/curation/kind";
import { ISSUE_CODES, ISSUE_LABELS, type IssueCode } from "@/lib/curation/issues";
import type { CurationStatus } from "@/lib/curation/engine";
import { adminPanelSx } from "./AdminUi";
import { CurationEntries } from "./CurationEntries";
import { TimelinePanel } from "./TimelinePanel";
import { TranslationPanel } from "./TranslationPanel";

const CHANGED_LABELS: Array<[string, string]> = [
  ["titles", "Títulos completados"],
  ["synopsis", "Sinopses completadas"],
  ["genres", "Gêneros corrigidos"],
  ["officialSite", "Sites oficiais"],
  ["kind", "Tipos classificados"],
  ["relations", "Linhas do tempo ligadas"],
  ["translations", "Traduções trazidas"],
];

const KIND_ORDER = ["EPISODE", "OVA", "ODA", "MOVIE", "OTHER", "UNKNOWN"];
const kindLabel = (kind: string) => (kind === "UNKNOWN" ? "Sem tipo" : KIND_LABELS[kind as keyof typeof KIND_LABELS] ?? kind);

type IssuePage = { total: number; page: number; pageSize: number; why: string; items: Array<{ id: string; title: string; anilistId: number | null; anidbId: number | null }> };

function eta(startedAt: string, doneNow: number, doneBefore: number, total: number): string | null {
  const processed = doneNow - doneBefore;
  const elapsed = Date.now() - Date.parse(startedAt);
  if (processed < 20 || elapsed < 5000) return null;
  const remaining = ((total - doneNow) * elapsed) / processed;
  const minutes = Math.ceil(remaining / 60000);
  return minutes <= 1 ? "menos de 1 min" : `~${minutes} min`;
}

/**
 * Admin → Curadoria: andamento visual da curadoria do catálogo (barra, o que foi corrigido, tipos) e a lista de pendências
 * que viram o ADR. Consulta `/api/admin/curation` a cada 2 s enquanto há uma curadoria rodando.
 */
export function CurationPanel() {
  const [status, setStatus] = useState<CurationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState<IssueCode | null>(null);
  const [openPage, setOpenPage] = useState(0);
  const [issuePage, setIssuePage] = useState<IssuePage | null>(null);

  // `tick` pede uma nova consulta (depois de iniciar); com a curadoria rodando, repete a cada 2 s.
  const [tick, setTick] = useState(0);
  const running = status?.job?.state === "RUNNING";
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/curation", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next = (await res.json()) as CurationStatus;
        if (cancelled) return;
        setStatus(next);
        setError(null);
      } catch {
        if (!cancelled) setError("Não consegui consultar o andamento. Tente de novo em instantes.");
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/curation/issues?code=${open}&page=${openPage}`, { cache: "no-store" });
      if (res.ok && !cancelled) setIssuePage((await res.json()) as IssuePage);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, openPage]);

  async function start(force: boolean) {
    setStarting(true);
    try {
      const res = await fetch("/api/admin/curation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
      if (res.status !== 202 && res.status !== 409) setError("Não foi possível iniciar a curadoria.");
      setTick((n) => n + 1);
    } finally {
      setStarting(false);
    }
  }

  if (!status) {
    return <Typography data-testid="curation-loading">{error ?? "Carregando…"}</Typography>;
  }

  const progress = status.progress;
  const done = running && progress ? progress.done : status.curated;
  const percent = status.total ? Math.min(100, Math.floor((done / status.total) * 100)) : 0;
  const stateLabel = running ? "Rodando" : status.job?.state === "FAILED" ? "Falhou" : done >= status.total && status.total > 0 ? "Concluída" : status.job ? "Parada" : "Ainda não rodou";
  const stateColor = running ? "info" : status.job?.state === "FAILED" ? "error" : done >= status.total && status.total > 0 ? "success" : "default";
  const remaining = running && progress ? eta(progress.startedAt, progress.done, progress.done - 0, status.total) : null;
  const kinds = status.kinds;
  const maxKind = Math.max(1, ...Object.values(kinds));
  const openTotal = Object.values(status.openIssues).reduce((a, b) => a + b, 0);

  return (
    <Stack spacing={3} data-testid="curation-panel">
      {error && <Alert severity="warning">{error}</Alert>}
      {status.job?.state === "FAILED" && status.job.error && <Alert severity="error">A última curadoria falhou: {status.job.error}</Alert>}

      <Box component="section" sx={adminPanelSx} data-testid="curation-progress">
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Typography component="h2" sx={{ fontSize: 20 }}>
              Andamento da curadoria
            </Typography>
            <Chip size="small" color={stateColor} label={stateLabel} data-testid="curation-state" />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={running || starting} onClick={() => void start(false)} data-testid="curation-start">
              {done > 0 && done < status.total ? "Retomar curadoria" : "Iniciar curadoria"}
            </Button>
            <Button variant="outlined" disabled={running || starting} onClick={() => void start(true)} data-testid="curation-restart">
              Reprocessar tudo
            </Button>
          </Stack>
        </Box>
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography data-testid="curation-count" sx={{ fontSize: 15 }}>
              <strong>{done.toLocaleString("pt-BR")}</strong> de {status.total.toLocaleString("pt-BR")} obras
            </Typography>
            <Typography data-testid="curation-percent" sx={{ fontSize: 15, fontWeight: 700 }}>
              {percent}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={percent} sx={{ height: 14, borderRadius: 7 }} aria-label="Andamento da curadoria" />
          <Typography sx={{ mt: 0.75, fontSize: 13, color: "text.secondary" }} data-testid="curation-note">
            {running ? `${status.job?.progressNote ?? "Curando…"}${progress?.currentTitle ? ` · agora: ${progress.currentTitle}` : ""}${remaining ? ` · falta ${remaining}` : ""}` : status.job?.finishedAt ? `Última execução terminou em ${new Date(status.job.finishedAt).toLocaleString("pt-BR")}.` : "Passa por todas as obras da plataforma, uma a uma, e anota o que não conseguiu resolver."}
          </Typography>
          {progress && progress.failedBatches > 0 && (
            <Typography sx={{ mt: 0.5, fontSize: 13, color: "warning.main" }}>
              {progress.failedBatches} lote(s) ficaram sem resposta da AniList; use &quot;Retomar curadoria&quot; para tentar de novo.
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" } }}>
        <Box component="section" sx={adminPanelSx} data-testid="curation-changed">
          <Typography component="h2" sx={{ fontSize: 20 }}>
            O que foi corrigido
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>
            {CHANGED_LABELS.map(([key, label]) => (
              <Box key={key} sx={{ p: 1.5, borderRadius: "10px", border: 1, borderColor: "divider" }}>
                <Typography data-testid={`curation-changed-${key}`} sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>
                  {(progress?.changed[key] ?? 0).toLocaleString("pt-BR")}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{label}</Typography>
              </Box>
            ))}
          </Box>
          {progress && (progress.withPt > 0 || progress.withJa > 0) && (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              Sinopses já traduzidas: {progress.withPt.toLocaleString("pt-BR")} em português e {progress.withJa.toLocaleString("pt-BR")} em japonês.
            </Typography>
          )}
        </Box>

        <Box component="section" sx={adminPanelSx} data-testid="curation-kinds">
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Tipos na linha da história
          </Typography>
          <Stack spacing={1}>
            {KIND_ORDER.filter((k) => kinds[k]).map((k) => (
              <Box key={k} data-testid={`curation-kind-${k}`}>
                <Box sx={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{kindLabel(k)}</span>
                  <span>{kinds[k].toLocaleString("pt-BR")}</span>
                </Box>
                <LinearProgress variant="determinate" value={(kinds[k] / maxKind) * 100} color={k === "UNKNOWN" ? "warning" : "primary"} sx={{ height: 8, borderRadius: 4 }} aria-label={kindLabel(k)} />
              </Box>
            ))}
            {Object.keys(kinds).length === 0 && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Ainda sem obras classificadas.</Typography>}
          </Stack>
        </Box>
      </Box>

      <TranslationPanel />

      <TimelinePanel />

      <CurationEntries running={Boolean(running)} />

      <Box component="section" sx={adminPanelSx} data-testid="curation-issues">
        <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Pendências (ADR)
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="curation-issues-total">
            {openTotal.toLocaleString("pt-BR")} em aberto
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>O que a curadoria não conseguiu resolver porque a fonte não tem o dado. Nada é preenchido por palpite.</Typography>
        <Stack spacing={1}>
          {ISSUE_CODES.map((code) => (
            <Box key={code} sx={{ border: 1, borderColor: "divider", borderRadius: "10px", p: 1.5 }} data-testid={`curation-issue-${code}`}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
                    {ISSUE_LABELS[code].title} <span data-testid={`curation-issue-count-${code}`}>· {(status.openIssues[code] ?? 0).toLocaleString("pt-BR")}</span>
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{ISSUE_LABELS[code].why}</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" disabled={!status.openIssues[code]} onClick={() => { setOpen(open === code ? null : code); setOpenPage(0); setIssuePage(null); }}>
                    {open === code ? "Fechar" : "Ver"}
                  </Button>
                  <Button size="small" component="a" href={`/api/admin/curation/issues?code=${code}&format=csv`} disabled={!status.openIssues[code]}>
                    CSV
                  </Button>
                </Stack>
              </Box>
              {open === code && (
                <Box sx={{ mt: 1.5 }} data-testid={`curation-issue-list-${code}`}>
                  {!issuePage ? (
                    <Typography sx={{ fontSize: 13 }}>Carregando…</Typography>
                  ) : (
                    <>
                      <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13 }}>
                        {issuePage.items.map((item) => (
                          <li key={item.id}>
                            {item.title} <span style={{ opacity: 0.6 }}>{item.anilistId ? `· AniList ${item.anilistId}` : item.anidbId ? `· AniDB ${item.anidbId}` : ""}</span>
                          </li>
                        ))}
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
                        <Button size="small" disabled={openPage === 0} onClick={() => setOpenPage(openPage - 1)}>
                          Anteriores
                        </Button>
                        <Typography sx={{ fontSize: 12 }}>
                          {issuePage.page * issuePage.pageSize + 1}–{Math.min((issuePage.page + 1) * issuePage.pageSize, issuePage.total)} de {issuePage.total.toLocaleString("pt-BR")}
                        </Typography>
                        <Button size="small" disabled={(openPage + 1) * issuePage.pageSize >= issuePage.total} onClick={() => setOpenPage(openPage + 1)}>
                          Próximas
                        </Button>
                      </Stack>
                    </>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
