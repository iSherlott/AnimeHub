"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import type { StoryStatus } from "@/lib/story/status";
import { adminPanelSx } from "./AdminUi";

const fmt = (n: number) => n.toLocaleString("pt-BR");

const EXAMPLE = `{
  "loot": "reboots-001",
  "items": [
    {
      "a": 136, "b": 11061, "verdict": "REBOOT", "source": "https://en.wikipedia.org/wiki/...",
      "reboot": { "old": 136, "new": 11061, "coverage": "PARTIAL", "beyondFromEpisode": 76, "note": "…" },
      "arcs": [{ "anilistId": 11061, "list": [{ "nameEn": "Hunter Exam", "start": 1, "end": 26 }] }]
    }
  ]
}`;

/**
 * Admin → Curadoria → reboots e arcos: a pesquisa é feita obra a obra, em lotes (o nome e a sinopse não decidem se uma história
 * foi refeita do zero). Mostra quantos pares da fila já foram conferidos, o que vem a seguir e o que foi decidido, e aplica um
 * lote de pesquisa colado em JSON (validado inteiro antes de gravar).
 */
export function StoryPanel() {
  const [status, setStatus] = useState<StoryStatus | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/story", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setStatus((await res.json()) as StoryStatus);
      setLoadError(null);
    } catch {
      setLoadError("Não consegui consultar a pesquisa de reboots agora.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function apply() {
    setBusy(true);
    setErrors(null);
    setDone(null);
    try {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        setErrors(["O texto não é um JSON válido."]);
        return;
      }
      const res = await fetch("/api/admin/story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { errors?: string[]; loot?: string; reviewed?: number; reboots?: number; notReboots?: number; arcs?: number };
      if (!res.ok) {
        setErrors(json.errors ?? ["Não foi possível aplicar o lote."]);
        return;
      }
      setDone(`Lote ${json.loot} aplicado: ${json.reviewed} par(es) conferido(s), ${json.reboots} reboot(s), ${json.notReboots} que não são reboot, ${json.arcs} arco(s). As linhas do tempo estão sendo refeitas em segundo plano.`);
      setText("");
      await load();
    } catch {
      setErrors(["Não consegui falar com o servidor."]);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <Typography data-testid="story-loading">{loadError ?? "Carregando a pesquisa de reboots…"}</Typography>;
  const percent = status.candidates ? Math.floor((status.reviewed / status.candidates) * 100) : 0;

  return (
    <Box component="section" sx={adminPanelSx} data-testid="story-panel">
      <Typography component="h2" sx={{ fontSize: 20 }}>
        Reboots e arcos
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Algumas histórias foram refeitas do zero (reboot). Dois cadastros ligados como &quot;versão alternativa&quot; na AniList podem ser isso ou só universos parecidos: o nome e a sinopse não decidem, então cada par é pesquisado, em lotes. Cada versão fica com a sua linha do tempo, uma aponta a outra, e os episódios saem separados por arcos.
      </Typography>
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography data-testid="story-count" sx={{ fontSize: 15 }}>
            <strong>{fmt(status.reviewed)}</strong> de {fmt(status.candidates)} pares pesquisados
          </Typography>
          <Typography data-testid="story-percent" sx={{ fontSize: 15, fontWeight: 700 }}>
            {percent}%
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={percent} sx={{ height: 12, borderRadius: 6 }} aria-label="Andamento da pesquisa de reboots" />
      </Box>
      <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1 }} data-testid="story-summary">
        <Chip size="small" color={status.reboots ? "success" : "default"} label={`Reboots ligados: ${fmt(status.reboots)}`} />
        <Chip size="small" label={`Não são reboot: ${fmt(status.notReboots)}`} />
        <Chip size="small" label={`Obras com arcos: ${fmt(status.worksWithArcs)} (${fmt(status.arcs)} arcos)`} />
        <Chip size="small" color={status.longWithoutArcs ? "warning" : "default"} label={`Séries longas sem arcos: ${fmt(status.longWithoutArcs)}`} data-testid="story-long-without-arcs" />
        {status.loots.map((l) => (
          <Chip key={l.loot} size="small" variant="outlined" label={`${l.loot}: ${l.items}`} />
        ))}
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" }, gap: 3 }}>
        <Box>
          <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>
            Próximos a pesquisar (mais populares primeiro)
          </Typography>
          {status.next.length === 0 ? (
            <Typography sx={{ fontSize: 14 }}>Nenhum par na fila.</Typography>
          ) : (
            <Box component="ul" data-testid="story-next" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.75 }}>
              {status.next.map((c) => (
                <Box component="li" key={c.key} sx={{ fontSize: 13 }}>
                  {c.a.title} ({c.a.year ?? "?"}, {c.a.episodes ?? "?"} ep.) · AniList {c.a.anilistId} ↔ {c.b.title} ({c.b.year ?? "?"}, {c.b.episodes ?? "?"} ep.) · AniList {c.b.anilistId}
                </Box>
              ))}
            </Box>
          )}
        </Box>
        <Box>
          <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>
            Pesquisados por último
          </Typography>
          {status.recent.length === 0 ? (
            <Typography sx={{ fontSize: 14 }}>Nenhum par pesquisado ainda.</Typography>
          ) : (
            <Box component="ul" data-testid="story-recent" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.75 }}>
              {status.recent.map((r) => (
                <Box component="li" key={`${r.anilistIdA}-${r.anilistIdB}`} sx={{ fontSize: 13 }}>
                  <strong>{r.verdict === "REBOOT" ? "Reboot" : "Não é reboot"}</strong>
                  {r.verdict === "REBOOT" ? (r.coverage === "PARTIAL" ? ` (vai além a partir do ep. ${r.beyondFromEpisode})` : " (mesma história)") : ""}: {r.titleA} ↔ {r.titleB}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {status.nextArcs.length > 0 && (
        <Box>
          <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>
            Próximas séries longas para cadastrar os arcos (as mais longas primeiro)
          </Typography>
          <Box component="ul" data-testid="story-next-arcs" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.5 }}>
            {status.nextArcs.map((w) => (
              <Box component="li" key={w.anilistId} sx={{ fontSize: 13 }}>
                {w.title} ({w.year ?? "?"}, {fmt(w.episodes)} ep.) · AniList {w.anilistId}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700 }}>
          Aplicar um lote de pesquisa
        </Typography>
        <TextField multiline minRows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} slotProps={{ htmlInput: { "data-testid": "story-loot-text", "aria-label": "Lote de pesquisa em JSON", spellCheck: false } }} sx={{ "& textarea": { fontFamily: "ui-monospace, monospace", fontSize: 12 } }} />
        <Box>
          <Button variant="contained" disabled={busy || text.trim() === ""} onClick={() => void apply()} data-testid="story-loot-apply">
            Aplicar o lote
          </Button>
        </Box>
        {errors && (
          <Alert severity="error" data-testid="story-loot-errors">
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </Box>
          </Alert>
        )}
        {done && (
          <Alert severity="success" data-testid="story-loot-done">
            {done}
          </Alert>
        )}
      </Box>
      {loadError && <Alert severity="warning">{loadError}</Alert>}
    </Box>
  );
}
