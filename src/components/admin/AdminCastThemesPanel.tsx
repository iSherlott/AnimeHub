"use client";

import { useState } from "react";
import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { AdminPanel } from "@/components/admin/AdminUi";

const SEASONS = [
  ["WINTER", "Inverno"],
  ["SPRING", "Primavera"],
  ["SUMMER", "Verão"],
  ["FALL", "Outono"],
] as const;

/** Dispara a carga do elenco (AniList) ou das aberturas (AnimeThemes) das obras de uma temporada. */
export function AdminCastThemesPanel({ defaultSeason }: { defaultSeason: { season: string; year: number } }) {
  const [season, setSeason] = useState(defaultSeason.season);
  const [year, setYear] = useState(String(defaultSeason.year));
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(what: "cast" | "themes") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/cast-themes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ season, seasonYear: Number(year), what }) });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? { kind: "success", text: `Carga iniciada para ${data.works} obras. Leva alguns minutos; o resultado aparece em Logs.` } : { kind: "error", text: data.error ?? "Não foi possível iniciar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Carregar uma temporada" testId="admin-cast-themes">
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Elenco: personagens principais e de apoio de cada obra, com o dublador japonês (AniList). Aberturas e encerramentos: título, artistas e o link do vídeo no AnimeThemes (nada é copiado).
      </Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
        <TextField select label="Temporada" size="small" value={season} onChange={(e) => setSeason(e.target.value)} sx={{ minWidth: 140 }}>
          {SEASONS.map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Ano" size="small" type="number" value={year} onChange={(e) => setYear(e.target.value)} sx={{ width: 110 }} />
        <Button variant="contained" onClick={() => void start("cast")} disabled={busy}>
          Carregar elenco
        </Button>
        <Button variant="outlined" onClick={() => void start("themes")} disabled={busy}>
          Carregar aberturas
        </Button>
      </Box>
      {message && (
        <Alert severity={message.kind} role="status">
          {message.text}
        </Alert>
      )}
    </AdminPanel>
  );
}
