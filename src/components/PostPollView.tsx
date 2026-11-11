"use client";

import { useState } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import type { PostPollDTO } from "@/lib/postPollTypes";

function closesText(poll: PostPollDTO): string {
  if (poll.closed) return "Enquete encerrada";
  if (!poll.closesAt) return "Sem prazo";
  const hours = Math.max(1, Math.round((new Date(poll.closesAt).getTime() - Date.now()) / 3600_000));
  return hours >= 48 ? `Fecha em ${Math.round(hours / 24)} dias` : `Fecha em ${hours} h`;
}

/**
 * Enquete da publicação (12/11/2026). Antes de votar, as opções são botões; depois (ou com a enquete fechada, ou para o
 * autor), aparecem as barras com a porcentagem. Dá para trocar o voto tocando em outra opção enquanto está aberta.
 */
export function PostPollView({ postId, initial, isMine }: { postId: string; initial: PostPollDTO; isMine: boolean }) {
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showResults = poll.closed || poll.myOptionId !== null || isMine;

  async function vote(optionId: string) {
    if (busy || poll.closed || optionId === poll.myOptionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/poll`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Não foi possível votar agora.");
      else setPoll(data.poll);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box role="group" aria-label="Enquete" data-testid="post-poll" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {poll.options.map((o) => {
        const pct = poll.total > 0 ? Math.round((o.votes / poll.total) * 100) : 0;
        const mine = o.id === poll.myOptionId;
        return (
          <ButtonBase
            key={o.id}
            onClick={() => void vote(o.id)}
            disabled={busy || poll.closed}
            aria-pressed={mine}
            data-testid="post-poll-option"
            sx={{
              position: "relative",
              overflow: "hidden",
              justifyContent: "space-between",
              gap: 1,
              minHeight: 44,
              px: 1.5,
              borderRadius: "10px",
              border: 1,
              borderColor: mine ? "secondary.main" : "divider",
              textAlign: "left",
              color: "text.primary",
              "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main" },
            }}
          >
            {showResults && <Box aria-hidden sx={{ position: "absolute", inset: 0, width: `${pct}%`, bgcolor: mine ? "rgba(255,212,0,0.18)" : "rgba(255,255,255,0.06)", transition: "width 300ms" }} />}
            <Typography component="span" sx={{ position: "relative", fontSize: 15, fontWeight: mine ? 700 : 500, overflowWrap: "anywhere" }}>
              {o.label}
              {mine ? " ✓" : ""}
            </Typography>
            {showResults && (
              <Typography component="span" sx={{ position: "relative", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} data-testid="post-poll-pct">
                {pct}%
              </Typography>
            )}
          </ButtonBase>
        );
      })}
      <Typography sx={{ fontSize: 12, color: "text.secondary" }} data-testid="post-poll-meta">
        {poll.total} {poll.total === 1 ? "voto" : "votos"} · {closesText(poll)}
        {!poll.closed && poll.myOptionId ? " · toque em outra opção para trocar" : ""}
      </Typography>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "error.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
