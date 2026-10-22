"use client";

import { Box, Typography } from "@mui/material";
import { BranchCard } from "@/components/BranchCard";
import { ArcHeader, BeyondNotice, ContinuesNotice, NO_MARKERS, type StoryMarkers } from "@/components/StoryMarkers";
import { VerticalTimeline, type TimelineNode } from "@/components/VerticalTimeline";
import { useTitlePreference } from "@/lib/titlePreference";
import { arcOf, type ArcInfo } from "@/lib/story/versions";
import type { Branch } from "@/lib/workJourney";

/**
 * Obra sem episódios com data ainda: o que existe é a linha dos arcos (quando a pesquisa já os cadastrou), os pontos de virada
 * entre a versão antiga e o reboot e a ramificação dos especiais (OVA, ODA, filmes).
 */
export function BranchOnlyTimeline({ message, branches, arcs = [], markers = NO_MARKERS }: { message: string; branches: Branch[]; arcs?: ArcInfo[]; markers?: StoryMarkers }) {
  const language = useTitlePreference().preference.language;
  const nodes: TimelineNode[] = [];
  for (const arc of arcs) {
    // O ponto em que o reboot passa do que a versão antiga contou vem logo antes do arco em que isso acontece.
    if (markers.beyondFrom && arcOf(markers.beyondFrom.episode, arcs)?.position === arc.position) {
      nodes.push({ key: "beyond", tone: "notice", children: <BeyondNotice marker={markers.beyondFrom} arc={arc} language={language} /> });
    }
    nodes.push({ key: `arc-${arc.position}`, tone: "arc", children: <ArcHeader arc={arc} language={language} /> });
  }
  if (markers.continuesIn) nodes.push({ key: "continues", tone: "notice", children: <ContinuesNotice marker={markers.continuesIn} /> });
  for (const b of branches) nodes.push({ key: `branch-${b.anilistId}`, branch: true, children: <BranchCard branch={b} /> });
  return (
    <Box data-testid="branch-only-timeline" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {message}
      </Typography>
      {nodes.length > 0 && <VerticalTimeline label="Arcos e especiais da obra" nodes={nodes} />}
    </Box>
  );
}
