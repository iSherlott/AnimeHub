"use client";

import { useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { BranchCard } from "@/components/BranchCard";
import { CollapsibleEpisodes } from "@/components/CollapsibleEpisodes";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { ArcHeader, BeyondNotice, ContinuesNotice, NO_MARKERS, type StoryMarkers } from "@/components/StoryMarkers";
import { VerticalTimeline, type TimelineNode } from "@/components/VerticalTimeline";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useTimeZone } from "@/lib/useTimeZone";
import { useWindowedList } from "@/lib/useWindowedList";
import { useTitlePreference } from "@/lib/titlePreference";
import { groupByArcs, type ArcInfo } from "@/lib/story/versions";
import { interleave, type Branch } from "@/lib/workJourney";
import { RELEASE_STATE_LABELS, type ReleaseState } from "@/lib/episodeState";

/** Quantos episódios aparecem de cada vez (o resto vem ao rolar). */
const SCHEDULE_WINDOW = 24;

/**
 * Episódio global (Fase 4): `airingAt` só existe com dia e hora conhecidos; `airDate` é só o dia (sem horário inventado);
 * `state` vem do servidor (exibido, agendado, previsto, data desconhecida, adiado, cancelado).
 */
export type ScheduledEpisode = {
  episode: number;
  airingAt: string | null;
  airDate?: string | null;
  state?: ReleaseState;
  title?: { romaji: string | null; english: string | null; native: string | null } | null;
  synopsis?: string | null;
  image: string | null;
};

const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric" });

function episodeDateMs(e: ScheduledEpisode): number | null {
  if (e.airingAt) return new Date(e.airingAt).getTime();
  return e.airDate ? new Date(`${e.airDate}T00:00:00Z`).getTime() : null;
}

/**
 * Episódios da obra a partir do calendário (data e hora no fuso da pessoa), para quem ainda não a acompanha, em linha do tempo
 * vertical: já exibidos, o próximo em destaque e os que vêm; OVA, ODA e filmes se ramificam no ponto em que foram ao ar.
 */
export function ScheduleEpisodeList({ episodes, branches = [], nowMs, arcs = [], markers = NO_MARKERS }: { episodes: ScheduledEpisode[]; branches?: Branch[]; nowMs?: number; arcs?: ArcInfo[]; markers?: StoryMarkers }) {
  const timeZone = useTimeZone();
  const [now] = useState(() => nowMs ?? Date.now());
  const { language, japaneseScript } = useTitlePreference().preference;
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const items = useMemo(() => interleave(episodes.map((e) => ({ e, dateMs: episodeDateMs(e) })), branches), [episodes, branches]);
  const nextEpisode = episodes.find((e) => e.airingAt && new Date(e.airingAt).getTime() > now && (e.state ?? "SCHEDULED") === "SCHEDULED")?.episode;
  // Rolagem infinita: obras longas têm centenas de episódios, que aparecem aos poucos.
  const grouped = useMemo(() => groupByArcs(items, (item) => (item.type === "episode" ? { number: item.episode.e.episode } : null), arcs, markers.beyondFrom?.episode ?? null), [items, arcs, markers.beyondFrom]);
  const windowed = useWindowedList(grouped, String(grouped.length), SCHEDULE_WINDOW);
  const { ref: sentinelRef, supported } = useInfiniteScroll(windowed.loadMore, windowed.hasMore, windowed.shown);

  const nodes: TimelineNode[] = windowed.visible.map((entry): TimelineNode => {
    if (entry.kind === "arc") return { key: `arc-${entry.arc.position}`, tone: "arc", children: <ArcHeader arc={entry.arc} language={language} /> };
    if (entry.kind === "beyond" && markers.beyondFrom) return { key: "beyond", tone: "notice", children: <BeyondNotice marker={markers.beyondFrom} arc={entry.arc} language={language} /> };
    if (entry.kind === "beyond") return { key: "beyond", tone: "notice", children: null };
    const item = entry.item;
    if (item.type === "branch") return { key: `branch-${item.branch.anilistId}`, branch: true, children: <BranchCard branch={item.branch} /> };
    const { e, dateMs } = item.episode;
    const state: ReleaseState = e.state ?? (dateMs !== null && dateMs <= now ? "AIRED" : "SCHEDULED");
    const aired = state === "AIRED";
    const native = language === "ja" && japaneseScript !== "romaji";
    const title = e.title ? (native ? e.title.native : language === "ja" ? e.title.romaji : e.title.english) ?? e.title.romaji ?? e.title.english ?? e.title.native : null;
    const when = e.airingAt ? fmt.format(new Date(e.airingAt)) : e.airDate ? dayFmt.format(new Date(`${e.airDate}T00:00:00Z`)) : null;
    return {
      key: `ep-${e.episode}`,
      tone: e.episode === nextEpisode ? "next" : aired ? "done" : "upcoming",
      testId: `schedule-episode-${e.episode}`,
      children: (
        <Box sx={{ borderRadius: "10px", border: 1, borderColor: e.episode === nextEpisode ? "primary.main" : "divider", bgcolor: "background.paper", p: 1.5, display: "flex", flexDirection: "column", gap: 0.5, opacity: aired ? 0.8 : 1 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
            EP{String(e.episode).padStart(2, "0")}
            {title && (
              <Box component="span" lang={native && e.title?.native ? "ja" : undefined} sx={{ fontWeight: 400 }} data-testid={`schedule-episode-${e.episode}-title`}>
                {" · "}
                {title}
              </Box>
            )}
          </Typography>
          <Typography suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary" }} data-testid={`schedule-episode-${e.episode}-state`}>
            {e.episode === nextEpisode ? "Próximo" : RELEASE_STATE_LABELS[state]}
            {when ? ` · ${when}` : ""}
          </Typography>
          {e.synopsis && <Typography sx={{ fontSize: 13, color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.synopsis}</Typography>}
        </Box>
      ),
    };
  });

  if (!windowed.hasMore && markers.continuesIn) nodes.push({ key: "continues", tone: "notice", children: <ContinuesNotice marker={markers.continuesIn} /> });

  return (
    <CollapsibleEpisodes summary={`${episodes.length} ${episodes.length === 1 ? "episódio" : "episódios"}${branches.length > 0 ? ` · ${branches.length} ${branches.length === 1 ? "especial ramificado" : "especiais ramificados"}` : ""}`}>
      <VerticalTimeline label="Episódios em ordem de exibição" testId="schedule-episodes" nodes={nodes} />
      <InfiniteFooter testId="schedule" sentinelRef={sentinelRef} supported={supported} hasMore={windowed.hasMore} loadingMore={false} failed={false} onMore={windowed.loadMore} onRetry={windowed.loadMore} moreLabel="Ver mais episódios" />
    </CollapsibleEpisodes>
  );
}
