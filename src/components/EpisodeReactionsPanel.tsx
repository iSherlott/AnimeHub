"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Rating, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { EpisodeStat, MyEpisodeEntry } from "@/lib/episodeReactions";

const EMOJIS = ["🔥", "😭", "😂", "😱", "❤️", "🤯", "😴"];
const NOTE_MAX = 280;
type Data = { stats: EpisodeStat[]; mine: MyEpisodeEntry[]; aired: number[] };

/**
 * Curva da temporada (nota média por episódio, de quem reagiu) e o meu registro de cada episódio já exibido: uma
 * reação, uma nota de 1 a 5 e o diário (só meu). Fica na página da obra de quem acompanha.
 */
export function EpisodeReactionsPanel({ workKey }: { workKey: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [episode, setEpisode] = useState<number | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/episode-reactions?obra=${encodeURIComponent(workKey)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: Data | null) => {
        if (cancelled || !d) return;
        setData(d);
        const last = d.aired[d.aired.length - 1] ?? null;
        setEpisode(last);
        const mine = d.mine.find((m) => m.episode === last);
        setEmoji(mine?.emoji ?? null);
        setRating(mine?.rating ?? null);
        setNote(mine?.note ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workKey]);

  const statByEpisode = useMemo(() => new Map((data?.stats ?? []).map((s) => [s.episode, s])), [data]);
  if (!data || data.aired.length === 0) return null;

  function pick(ep: number) {
    setEpisode(ep);
    setMessage(null);
    const mine = data?.mine.find((m) => m.episode === ep);
    setEmoji(mine?.emoji ?? null);
    setRating(mine?.rating ?? null);
    setNote(mine?.note ?? "");
  }

  async function save() {
    if (episode === null) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/episode-reactions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work: workKey, episode, emoji, rating, note }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? "Não foi possível salvar." });
        return;
      }
      const fresh = await fetch(`/api/episode-reactions?obra=${encodeURIComponent(workKey)}`).then((r) => (r.ok ? r.json() : null));
      if (fresh) setData(fresh);
      setMessage({ kind: "ok", text: body.entry ? `Episódio ${episode} salvo.` : `Registro do episódio ${episode} apagado.` });
    } finally {
      setSaving(false);
    }
  }

  const rated = data.stats.filter((s) => s.avgRating !== null);
  const peak = rated.length ? rated.reduce((best, s) => ((s.avgRating ?? 0) > (best.avgRating ?? 0) ? s : best)) : null;
  const mineByEpisode = new Map(data.mine.map((m) => [m.episode, m]));

  return (
    <Box component="section" id="reacoes" aria-labelledby="reactions-heading" data-testid="episode-reactions" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
      <Typography id="reactions-heading" component="h2" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700 }}>
        Reações e diário
      </Typography>

      {/* Curva: uma barra por episódio exibido, na altura da nota média (1 a 5). */}
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2, bgcolor: "background.paper", display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {peak ? `O ponto alto até agora: episódio ${peak.episode} (nota ${peak.avgRating?.toLocaleString("pt-BR")} de 5).` : "Ninguém deu nota aos episódios ainda. Seja a primeira pessoa."}
        </Typography>
        <Box role="img" aria-label="Nota média de cada episódio" data-testid="episode-curve" sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 96, overflowX: "auto", pb: 0.5 }}>
          {data.aired.map((ep) => {
            const stat = statByEpisode.get(ep);
            const height = stat?.avgRating ? Math.max(8, (stat.avgRating / 5) * 80) : 4;
            return (
              <Box
                key={ep}
                component="button"
                type="button"
                onClick={() => pick(ep)}
                aria-label={`Episódio ${ep}${stat?.avgRating ? `, nota média ${stat.avgRating}` : ", sem nota"}`}
                aria-pressed={episode === ep}
                data-testid={`curve-ep-${ep}`}
                sx={{ flex: "0 0 auto", width: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, border: 0, p: 0, bgcolor: "transparent", cursor: "pointer", color: "text.secondary", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
              >
                <Box sx={{ width: 14, height, borderRadius: "4px 4px 0 0", bgcolor: episode === ep ? "secondary.main" : stat?.avgRating ? "primary.main" : "divider" }} />
                <Typography component="span" sx={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
                  {ep}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {episode !== null && (
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", p: 2, display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="episode-entry">
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Episódio {episode}</Typography>
          {(() => {
            const stat = statByEpisode.get(episode);
            return stat ? (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }} data-testid="episode-stat">
                {stat.topEmojis.map((e) => (
                  <Chip key={e.emoji} size="small" label={`${e.emoji} ${e.count}`} />
                ))}
                {stat.avgRating !== null && (
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    Nota média {stat.avgRating.toLocaleString("pt-BR")} ({stat.ratings} {stat.ratings === 1 ? "nota" : "notas"})
                  </Typography>
                )}
              </Box>
            ) : null;
          })()}
          <ToggleButtonGroup exclusive value={emoji} onChange={(_, v) => setEmoji(v)} aria-label="Sua reação" size="small" sx={{ flexWrap: "wrap" }}>
            {EMOJIS.map((e) => (
              <ToggleButton key={e} value={e} aria-label={`Reagir com ${e}`} sx={{ fontSize: 18, px: 1.25 }}>
                {e}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography component="span" sx={{ fontSize: 14 }}>
              Sua nota
            </Typography>
            <Rating value={rating} onChange={(_, v) => setRating(v)} max={5} aria-label="Sua nota para o episódio" />
          </Box>
          <TextField
            label="Diário (só você vê)"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            multiline
            minRows={2}
            size="small"
            helperText={`${note.length}/${NOTE_MAX}`}
            slotProps={{ htmlInput: { "data-testid": "episode-note", maxLength: NOTE_MAX } }}
          />
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="contained" onClick={() => void save()} disabled={saving} data-testid="episode-save">
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            {message && (
              <Alert severity={message.kind === "ok" ? "success" : "error"} role="status" sx={{ py: 0 }}>
                {message.text}
              </Alert>
            )}
          </Box>
        </Box>
      )}

      {data.mine.some((m) => m.note) && (
        <Box component="section" aria-label="Seu diário" data-testid="episode-diary" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Seu diário</Typography>
          <Box component="ol" sx={{ m: 0, pl: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
            {[...mineByEpisode.values()]
              .filter((m) => m.note)
              .map((m) => (
                <Box component="li" key={m.episode} sx={{ fontSize: 14, borderLeft: 3, borderColor: "primary.main", pl: 1.5 }}>
                  <Box component="strong">Ep. {m.episode}</Box>
                  {m.emoji ? ` ${m.emoji}` : ""} — {m.note}
                </Box>
              ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
