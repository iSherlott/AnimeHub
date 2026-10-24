"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

type DelayItem = { anilistId: number; titleRomaji: string; titleNative: string | null; streamingDelayMinutes: number; streamingSite: string | null };

const describe = (minutes: number) => {
  const sign = minutes < 0 ? "antes" : "depois";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""} ${sign} da TV japonesa`;
};

/**
 * Atraso do streaming por obra (Epic 50): o calendário mostra o horário em que o episódio sai na plataforma (ex.: o
 * Crunchyroll libera 2 h depois da TV japonesa), com o horário da TV ao lado. O ID é o da AniList (aparece na página da
 * obra, no endereço `/anime/<id>`).
 */
export function StreamingDelayPanel() {
  const [items, setItems] = useState<DelayItem[] | null>(null);
  const [anilistId, setAnilistId] = useState("");
  const [site, setSite] = useState("Crunchyroll");
  const [hours, setHours] = useState("2");
  const [minutes, setMinutes] = useState("0");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/streaming-delay", { cache: "no-store" });
    if (res.ok) setItems(((await res.json()) as { items: DelayItem[] }).items);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(id: number, total: number | null, platform: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/streaming-delay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anilistId: id, minutes: total, site: platform }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "Não foi possível salvar." });
        return;
      }
      setMessage({ tone: "ok", text: total === null ? `Atraso retirado da obra #${id}.` : `Obra #${id}: ${platform ?? "streaming"} ${describe(total)} · ${data.episodes} episódio(s) do calendário ajustado(s).` });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const id = Number(anilistId);
    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    if (!Number.isInteger(id) || id <= 0) {
      setMessage({ tone: "error", text: "Informe o ID da obra na AniList (o número do endereço /anime/…)." });
      return;
    }
    void save(id, total === 0 ? null : total, site.trim() || null);
  }

  return (
    <Box component="section" data-testid="streaming-delay-panel" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3, borderRadius: "16px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Box>
        <Typography component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
          Atraso do streaming
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          O horário da fonte é o da TV japonesa. Diga quanto depois o episódio sai na plataforma: o calendário, o sino e o
          &quot;próximo episódio&quot; passam a usar esse horário, e o card mostra o da TV ao lado.
        </Typography>
      </Box>

      <Stack component="form" onSubmit={submit} direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "flex-end" } }}>
        <TextField label="ID na AniList" size="small" value={anilistId} onChange={(e) => setAnilistId(e.target.value.replace(/\D/g, ""))} slotProps={{ htmlInput: { inputMode: "numeric", "data-testid": "streaming-delay-id" } }} sx={{ width: { sm: 140 } }} />
        <TextField label="Plataforma" size="small" value={site} onChange={(e) => setSite(e.target.value)} slotProps={{ htmlInput: { maxLength: 40, "data-testid": "streaming-delay-site" } }} sx={{ width: { sm: 160 } }} />
        <TextField label="Horas depois" size="small" type="number" value={hours} onChange={(e) => setHours(e.target.value)} slotProps={{ htmlInput: { min: -24, max: 24, "data-testid": "streaming-delay-hours" } }} sx={{ width: { sm: 120 } }} />
        <TextField label="Minutos" size="small" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} slotProps={{ htmlInput: { min: 0, max: 59, "data-testid": "streaming-delay-minutes" } }} sx={{ width: { sm: 100 } }} />
        <Button type="submit" disabled={busy} sx={ELEVATED_BUTTON_SX} data-testid="streaming-delay-save">
          Salvar
        </Button>
      </Stack>
      {message && (
        <Typography role="status" data-testid="streaming-delay-message" sx={{ fontSize: 14, color: message.tone === "ok" ? "success.main" : "error.main" }}>
          {message.text}
        </Typography>
      )}

      {items && items.length > 0 && (
        <Box component="ul" data-testid="streaming-delay-list" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          {items.map((item) => (
            <Box component="li" key={item.anilistId} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", py: 1, borderTop: 1, borderColor: "divider" }}>
              <Box>
                <Typography lang={item.titleNative ? "ja" : undefined} sx={{ fontSize: 14, fontWeight: 700 }}>
                  {item.titleNative ?? item.titleRomaji} <span style={{ opacity: 0.6, fontWeight: 400 }}>· AniList #{item.anilistId}</span>
                </Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                  {item.streamingSite ?? "Streaming"} · {describe(item.streamingDelayMinutes)}
                </Typography>
              </Box>
              <Button size="small" disabled={busy} onClick={() => void save(item.anilistId, null, null)} sx={ELEVATED_BUTTON_SX} data-testid={`streaming-delay-remove-${item.anilistId}`}>
                Tirar atraso
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
