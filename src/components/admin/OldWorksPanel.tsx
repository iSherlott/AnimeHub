"use client";

import { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import type { OldWorksSummary } from "@/lib/oldWorksImport";
import { adminPanelSx } from "./AdminUi";
import { ImportProgress } from "./ImportProgress";

const FIRST_YEAR = 1917;
const LAST_YEAR = 1999;
const fmt = (n: number) => n.toLocaleString("pt-BR");

/**
 * Admin → Importar: traz para a plataforma as obras que estrearam antes de 2000, ano a ano, pela AniList (busca por temporada
 * e por data de estreia). Conteúdo adulto nunca entra e o que já está na plataforma não muda. Leva alguns minutos por década;
 * o andamento aparece enquanto roda. Depois da carga, rode a curadoria e a tradução em Admin → Curadoria.
 */
export function OldWorksPanel() {
  const [from, setFrom] = useState(String(FIRST_YEAR));
  const [to, setTo] = useState(String(LAST_YEAR));
  const [running, setRunning] = useState(false);
  const [since, setSince] = useState<number | undefined>();
  const [summary, setSummary] = useState<OldWorksSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const a = Number(from);
  const b = Number(to);
  const valid = Number.isInteger(a) && Number.isInteger(b) && a >= FIRST_YEAR && b <= LAST_YEAR && a <= b;

  async function start() {
    setRunning(true);
    setSince(Date.now());
    setSummary(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/anilist/years", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: a, to: b }) });
      const body = (await res.json()) as OldWorksSummary & { error?: string };
      if (!res.ok) setError(body.error ?? "A carga falhou. O que já entrou foi mantido; tente de novo.");
      else setSummary(body);
    } catch {
      setError("Não consegui falar com o servidor. A carga pode ter continuado: confira em Admin → Jobs.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Box component="section" sx={adminPanelSx} data-testid="old-works-panel">
      <Typography component="h2" sx={{ fontSize: 20 }}>
        Obras antigas (antes de 2000)
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Traz as obras que estrearam de {FIRST_YEAR} a {LAST_YEAR} pela AniList, ano a ano. Conteúdo adulto nunca entra e o que já está na plataforma não muda. O AniDB entra depois, quando houver um cliente válido.
      </Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 2, alignItems: "center" }}>
        <TextField size="small" type="number" label="Do ano" value={from} onChange={(e) => setFrom(e.target.value)} disabled={running} slotProps={{ htmlInput: { min: FIRST_YEAR, max: LAST_YEAR, "data-testid": "old-works-from" } }} sx={{ width: 120 }} />
        <TextField size="small" type="number" label="Até o ano" value={to} onChange={(e) => setTo(e.target.value)} disabled={running} slotProps={{ htmlInput: { min: FIRST_YEAR, max: LAST_YEAR, "data-testid": "old-works-to" } }} sx={{ width: 120 }} />
        <Button variant="contained" disabled={running || !valid} onClick={() => void start()} data-testid="old-works-start">
          Trazer as obras antigas
        </Button>
      </Stack>
      {!valid && <Typography sx={{ fontSize: 13, color: "warning.main" }}>Informe anos de {FIRST_YEAR} a {LAST_YEAR}, com o primeiro até o segundo.</Typography>}
      <ImportProgress running={running} since={since} kind="ANILIST" title="Trazendo as obras antigas" fallbackNote="Buscando na AniList…" />
      {summary && (
        <Alert severity="success" data-testid="old-works-result">
          {fmt(summary.years)} {summary.years === 1 ? "ano percorrido" : "anos percorridos"}: {fmt(summary.brought)} obra(s) trazida(s), {fmt(summary.alreadyIn)} já estavam{summary.blocked > 0 ? `, ${fmt(summary.blocked)} adulta(s) recusada(s)` : ""} e {fmt(summary.yearOnly)} só com o ano. Agora rode a curadoria e a tradução.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  );
}
