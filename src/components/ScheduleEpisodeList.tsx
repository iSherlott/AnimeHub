"use client";

import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTimeZone } from "@/lib/useTimeZone";

export type ScheduledEpisode = { episode: number; airingAt: string; image: string | null };

/** Episódios da obra a partir do calendário (data e hora no fuso da pessoa), para quem ainda não a acompanha. */
export function ScheduleEpisodeList({ episodes }: { episodes: ScheduledEpisode[] }) {
  const timeZone = useTimeZone();
  const [now] = useState(() => Date.now());
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <Box component="ul" data-testid="schedule-episodes" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5, listStyle: "none", p: 0, m: 0 }}>
      {episodes.map((e) => {
        const at = new Date(e.airingAt);
        const aired = at.getTime() <= now;
        return (
          <Box component="li" key={e.episode} data-testid={`schedule-episode-${e.episode}`} sx={{ borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "background.paper", p: 1.5, display: "flex", flexDirection: "column", gap: 0.5, opacity: aired ? 0.75 : 1 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>EP{String(e.episode).padStart(2, "0")}</Typography>
            <Typography suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary" }}>
              {aired ? "Exibido" : "Previsto"} · {fmt.format(at)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
