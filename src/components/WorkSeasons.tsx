"use client";

import { useState, type ReactNode } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { BranchCard } from "@/components/BranchCard";
import { SeasonControls, type MySeason } from "@/components/SeasonControls";
import { SynopsisText } from "@/components/SynopsisText";
import { VerticalTimeline } from "@/components/VerticalTimeline";
import type { SeasonEntry } from "@/lib/franchiseSeasons";
import type { Branch } from "@/lib/workJourney";

const STATUS_LABEL: Record<string, string> = { RELEASING: "Em exibição", FINISHED: "Finalizado", NOT_YET_RELEASED: "Em breve", CANCELLED: "Cancelado", HIATUS: "Em hiato" };
const SEASON_LABEL: Record<string, string> = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };
const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Filme", OVA: "OVA", ONA: "ONA", SPECIAL: "Especial", MUSIC: "Música" };

const whenOf = (s: SeasonEntry) => (s.season && s.seasonYear ? `${SEASON_LABEL[s.season] ?? s.season} ${s.seasonYear}` : s.seasonYear ? String(s.seasonYear) : null);

/**
 * As temporadas da obra em abas (Epic 46). Cada aba traz a situação da temporada, a sinopse, o andamento e a nota (estrelas)
 * de quem a tem na lista; a da obra aberta traz também a linha do tempo dos episódios (`children`, montada no servidor) e as
 * outras mostram os especiais que se ramificam delas e o caminho para abrir a temporada. Só aparece quando há mais de uma
 * temporada; com uma só, a página mostra apenas os episódios.
 */
export function WorkSeasons({ seasons, mine = {}, signedIn = false, branches = {}, children }: { seasons: SeasonEntry[]; mine?: Record<number, MySeason>; signedIn?: boolean; branches?: Record<number, Branch[]>; children?: ReactNode }) {
  const currentIndex = Math.max(0, seasons.findIndex((s) => s.current));
  const [selected, setSelected] = useState(currentIndex);
  if (seasons.length < 2) return <>{children}</>;
  const season = seasons[Math.min(selected, seasons.length - 1)];
  const facts = [season.status ? (STATUS_LABEL[season.status] ?? season.status) : null, whenOf(season), season.format ? (FORMAT_LABEL[season.format] ?? season.format) : null, season.episodes ? `${season.episodes} ${season.episodes === 1 ? "episódio" : "episódios"}` : null].filter(Boolean).join(" · ");
  const seasonBranches = branches[season.anilistId] ?? [];

  return (
    <Box component="section" aria-labelledby="temporadas-heading" data-testid="franchise-seasons" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography id="temporadas-heading" component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
        Temporadas e episódios
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        {seasons.length} temporadas desta obra, da primeira à mais recente. Escolha uma aba para ver a situação, a nota e os episódios dela.
      </Typography>
      <Tabs value={selected} onChange={(_, next: number) => setSelected(next)} variant="scrollable" scrollButtons="auto" aria-label="Temporadas da obra" sx={{ borderBottom: 1, borderColor: "divider" }}>
        {seasons.map((s, index) => (
          <Tab key={s.anilistId} value={index} id={`season-tab-${s.anilistId}`} aria-controls={`season-${s.anilistId}`} data-testid={`season-tab-${s.anilistId}`} label={`Temporada ${s.seasonNumber}${s.current ? " · atual" : ""}`} sx={{ textTransform: "none", fontWeight: 700 }} />
        ))}
      </Tabs>

      {/* A chave faz cada aba começar do zero: o estado do andamento e das estrelas é de UMA temporada. */}
      <Box key={season.anilistId} role="tabpanel" id={`season-${season.anilistId}`} aria-labelledby={`season-tab-${season.anilistId}`} data-testid={`season-${season.anilistId}`} data-current={season.current ? "true" : undefined} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography lang={season.titleNative ? "ja" : undefined} sx={{ fontSize: 18, fontWeight: 700, overflowWrap: "anywhere" }}>
            {season.titleNative ?? season.titleRomaji}
            {season.current && <span style={{ fontWeight: 400, opacity: 0.7 }}> · você está aqui</span>}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{facts || "—"}</Typography>
        </Box>
        {signedIn && <SeasonControls anilistId={season.anilistId} seasonNumber={season.seasonNumber} mine={mine[season.anilistId] ?? null} />}

        {season.current ? (
          children
        ) : (
          <>
            <SynopsisText description={season.description} anilistId={season.anilistId} stored={season.stored} sx={{ fontSize: 14, color: "text.secondary" }} data-testid={`season-synopsis-${season.anilistId}`} />
            {seasonBranches.length > 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" }}>Especiais que se ramificam desta temporada</Typography>
                <VerticalTimeline label={`Especiais da Temporada ${season.seasonNumber}`} testId={`season-branches-${season.anilistId}`} nodes={seasonBranches.map((b) => ({ key: `branch-${b.anilistId}`, branch: true, children: <BranchCard branch={b} /> }))} />
              </Box>
            )}
            <Box>
              <AppLink href={`/anime/${season.anilistId}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700 }}>
                Abrir a Temporada {season.seasonNumber}
              </AppLink>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
