"use client";

import { useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { POINTS_PER_FOLLOWER, type PoolView } from "@/lib/seasonPoolTypes";

/**
 * Bolão da temporada: a pessoa escolhe até N obras; o placar soma a nota do site (× 10) e 2 pontos por pessoa da
 * rede que acompanha cada obra escolhida.
 */
export function SeasonPoolView({ initial, viewerId }: { initial: PoolView; viewerId: string }) {
  const [pool, setPool] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const picked = new Set(pool.myPicks);
  const myStanding = pool.standings.find((s) => s.userId === viewerId);

  async function toggle(workKey: string) {
    setBusy(workKey);
    setError(null);
    try {
      const res = await fetch(`/api/pool/${pool.id}/picks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workKey, picked: !picked.has(workKey) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar a escolha.");
        return;
      }
      const fresh = await fetch("/api/pool").then((r) => (r.ok ? r.json() : null));
      if (fresh?.pool) setPool(fresh.pool);
    } finally {
      setBusy(null);
    }
  }

  const closes = new Date(pool.closesAt).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }} data-testid="season-pool">
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: "16px", p: 2.5, bgcolor: "background.paper", display: "flex", flexDirection: "column", gap: 1 }}>
        <Typography sx={{ fontSize: 14 }}>
          {pool.open ? (
            <>
              Escolha até <strong>{pool.picksPerUser}</strong> obras de {pool.seasonLabel} até <span suppressHydrationWarning>{closes}</span>. Você já escolheu{" "}
              <strong data-testid="pool-picked-count">{pool.myPicks.length}</strong>.
            </>
          ) : pool.status === "FINISHED" ? (
            "Bolão encerrado: o placar abaixo é o final."
          ) : (
            "As escolhas fecharam. O placar continua mudando até a administração encerrar o bolão."
          )}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Pontos de cada obra escolhida: a nota do site (média de quem terminou, 0 a 10) × 10, mais {POINTS_PER_FOLLOWER} por pessoa da rede que acompanha a obra.
        </Typography>
        {myStanding && (
          <Typography sx={{ fontSize: 14, fontWeight: 700 }} data-testid="pool-my-points">
            Seus pontos: {myStanding.points}
          </Typography>
        )}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 2fr) minmax(280px, 1fr)" }, gap: 3, alignItems: "start" }}>
        <Box component="ul" aria-label="Obras da temporada" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 }}>
          {pool.works.map((w) => {
            const isPicked = picked.has(w.workKey);
            return (
              <Box component="li" key={w.workKey} data-testid={`pool-work-${w.workKey}`} sx={{ border: 2, borderColor: isPicked ? "primary.main" : "divider", borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
                <Box sx={{ position: "relative", aspectRatio: "2 / 3", bgcolor: "#171820" }}>{w.coverImage && <CoverImage src={w.coverImage} sizes="200px" />}</Box>
                <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 0.5, flex: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }}>{w.titleRomaji}</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{w.points} pts agora</Typography>
                  {pool.open && (
                    <Button size="small" variant={isPicked ? "contained" : "outlined"} onClick={() => void toggle(w.workKey)} disabled={busy === w.workKey} aria-pressed={isPicked} sx={{ mt: "auto" }}>
                      {isPicked ? "Escolhida ✓" : "Escolher"}
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box component="section" aria-labelledby="pool-standings" sx={{ border: 1, borderColor: "divider", borderRadius: "16px", p: 2, bgcolor: "background.paper", display: "flex", flexDirection: "column", gap: 1.5, position: { lg: "sticky" }, top: { lg: 100 } }}>
          <Typography id="pool-standings" component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
            Placar
          </Typography>
          {pool.standings.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ninguém escolheu ainda.</Typography>
          ) : (
            <Box component="ol" sx={{ m: 0, pl: 3, display: "flex", flexDirection: "column", gap: 0.75 }}>
              {pool.standings.map((s) => (
                <Box component="li" key={s.userId} data-testid="pool-standing" sx={{ fontSize: 14, fontWeight: s.userId === viewerId ? 700 : 400 }}>
                  {s.displayName} — {s.points} pts
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
