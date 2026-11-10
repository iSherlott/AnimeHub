"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { Box, Button, Link as MuiLink, Typography } from "@mui/material";
import type { WeeklyVoteView } from "@/lib/weeklyVoteTypes";

/**
 * "Anime da semana" na lateral do Feed: enquanto está aberta, cada pessoa vota uma vez (pode trocar); encerrada, mostra
 * o vencedor e o link para a publicação do NewsHub com o resultado.
 */
export function WeeklyVoteCard() {
  const [vote, setVote] = useState<WeeklyVoteView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/weekly-vote")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setVote(data?.vote ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!vote) return null;
  const open = vote.status === "OPEN";

  async function choose(optionId: string) {
    if (!vote) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/weekly-vote/${vote.id}/ballot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.vote) setVote(data.vote);
    } finally {
      setBusy(false);
    }
  }

  const winner = vote.options.find((o) => o.workKey === vote.winnerKey);
  const showResults = !open || vote.myOptionId !== null;
  return (
    <Box component="section" aria-label="Anime da semana" data-testid="weekly-vote" sx={{ borderTop: 1, borderColor: "divider", pt: 3, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography component="h2" sx={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {vote.title}
      </Typography>
      {!open && winner && (
        <Typography sx={{ fontSize: 14 }} data-testid="weekly-vote-winner">
          🏆 <strong>{winner.titleRomaji}</strong> venceu com {winner.votes} {winner.votes === 1 ? "voto" : "votos"}.
          {vote.postId && (
            <>
              {" "}
              <MuiLink component={NextLink} href={`/publicacao/${vote.postId}`} underline="hover">
                Ver resultado
              </MuiLink>
            </>
          )}
        </Typography>
      )}
      {!open && !winner && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>A votação terminou sem votos.</Typography>}
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.75 }}>
        {vote.options.slice(0, open ? 8 : 3).map((o) => {
          const pct = vote.totalVotes ? Math.round((o.votes / vote.totalVotes) * 100) : 0;
          const mine = vote.myOptionId === o.id;
          return (
            <Box component="li" key={o.id}>
              <Button
                fullWidth
                disabled={!open || busy}
                onClick={() => void choose(o.id)}
                aria-pressed={mine}
                data-testid="weekly-vote-option"
                sx={{ justifyContent: "space-between", textAlign: "left", textTransform: "none", gap: 1, border: 1, borderColor: mine ? "primary.main" : "divider", borderRadius: "8px", px: 1.25, py: 0.75, color: "text.primary", position: "relative", overflow: "hidden" }}
              >
                {showResults && <Box aria-hidden sx={{ position: "absolute", inset: 0, width: `${pct}%`, bgcolor: "rgba(255,22,79,0.12)" }} />}
                <Box component="span" sx={{ position: "relative", fontSize: 13, overflowWrap: "anywhere" }}>
                  {o.titleRomaji}
                  {o.episode ? <Box component="span" sx={{ color: "text.secondary" }}>{` · ep ${o.episode}`}</Box> : null}
                </Box>
                {showResults && (
                  <Box component="span" sx={{ position: "relative", fontSize: 12, color: "text.secondary", flexShrink: 0 }}>
                    {pct}%
                  </Box>
                )}
              </Button>
            </Box>
          );
        })}
      </Box>
      {open && (
        <Typography suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary" }}>
          {vote.totalVotes} {vote.totalVotes === 1 ? "voto" : "votos"} · fecha em {new Date(vote.closesAt).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Typography>
      )}
    </Box>
  );
}
