"use client";

import { useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { BranchCard } from "@/components/BranchCard";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { VerticalTimeline, type TimelineNode } from "@/components/VerticalTimeline";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useTimeZone } from "@/lib/useTimeZone";
import { useWindowedList } from "@/lib/useWindowedList";
import { interleave, type Branch } from "@/lib/workJourney";

/** Quantos episódios aparecem de cada vez (o resto vem ao rolar). */
const SCHEDULE_WINDOW = 24;

export type ScheduledEpisode = { episode: number; airingAt: string; image: string | null };

/**
 * Episódios da obra a partir do calendário (data e hora no fuso da pessoa), para quem ainda não a acompanha, em linha do tempo
 * vertical: já exibidos, o próximo em destaque e os que vêm; OVA, ODA e filmes se ramificam no ponto em que foram ao ar.
 */
export function ScheduleEpisodeList({ episodes, branches = [], nowMs }: { episodes: ScheduledEpisode[]; branches?: Branch[]; nowMs?: number }) {
  const timeZone = useTimeZone();
  const [now] = useState(() => nowMs ?? Date.now());
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const items = useMemo(() => interleave(episodes.map((e) => ({ e, dateMs: new Date(e.airingAt).getTime() })), branches), [episodes, branches]);
  const nextEpisode = episodes.find((e) => new Date(e.airingAt).getTime() > now)?.episode;
  // Rolagem infinita: obras longas têm centenas de episódios, que aparecem aos poucos.
  const windowed = useWindowedList(items, String(items.length), SCHEDULE_WINDOW);
  const { ref: sentinelRef, supported } = useInfiniteScroll(windowed.loadMore, windowed.hasMore, windowed.shown);

  const nodes: TimelineNode[] = windowed.visible.map((item) => {
    if (item.type === "branch") return { key: `branch-${item.branch.anilistId}`, branch: true, children: <BranchCard branch={item.branch} /> };
    const { e, dateMs } = item.episode;
    const aired = dateMs <= now;
    return {
      key: `ep-${e.episode}`,
      tone: e.episode === nextEpisode ? "next" : aired ? "done" : "upcoming",
      testId: `schedule-episode-${e.episode}`,
      children: (
        <Box sx={{ borderRadius: "10px", border: 1, borderColor: e.episode === nextEpisode ? "primary.main" : "divider", bgcolor: "background.paper", p: 1.5, display: "flex", flexDirection: "column", gap: 0.5, opacity: aired ? 0.8 : 1 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>EP{String(e.episode).padStart(2, "0")}</Typography>
          <Typography suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary" }}>
            {aired ? "Exibido" : e.episode === nextEpisode ? "Próximo" : "Previsto"} · {fmt.format(new Date(e.airingAt))}
          </Typography>
        </Box>
      ),
    };
  });

  return (
    <>
      <VerticalTimeline label="Episódios em ordem de exibição" testId="schedule-episodes" nodes={nodes} />
      <InfiniteFooter testId="schedule" sentinelRef={sentinelRef} supported={supported} hasMore={windowed.hasMore} loadingMore={false} failed={false} onMore={windowed.loadMore} onRetry={windowed.loadMore} moreLabel="Ver mais episódios" />
    </>
  );
}
