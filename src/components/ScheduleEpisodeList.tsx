"use client";

import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useTimeZone } from "@/lib/useTimeZone";
import { useWindowedList } from "@/lib/useWindowedList";

/** Quantos episódios aparecem de cada vez (o resto vem ao rolar). */
const SCHEDULE_WINDOW = 24;

export type ScheduledEpisode = { episode: number; airingAt: string; image: string | null };

/** Episódios da obra a partir do calendário (data e hora no fuso da pessoa), para quem ainda não a acompanha. */
export function ScheduleEpisodeList({ episodes }: { episodes: ScheduledEpisode[] }) {
  const timeZone = useTimeZone();
  const [now] = useState(() => Date.now());
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  // Rolagem infinita: obras longas têm centenas de episódios, que aparecem aos poucos.
  const windowed = useWindowedList(episodes, String(episodes.length), SCHEDULE_WINDOW);
  const { ref: sentinelRef, supported } = useInfiniteScroll(windowed.loadMore, windowed.hasMore, windowed.shown);
  return (
    <>
    <Box component="ul" data-testid="schedule-episodes" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5, listStyle: "none", p: 0, m: 0 }}>
      {windowed.visible.map((e) => {
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
    <InfiniteFooter testId="schedule" sentinelRef={sentinelRef} supported={supported} hasMore={windowed.hasMore} loadingMore={false} failed={false} onMore={windowed.loadMore} onRetry={windowed.loadMore} moreLabel="Ver mais episódios" />
    </>
  );
}
