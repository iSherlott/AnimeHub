"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import NextLink from "next/link";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { EmptyState } from "@/components/StatePanels";
import { recentSeasons, seasonLabel, seasonSlug, type SeasonRef } from "@/lib/exploreGroups";
import type { AvailableSeason } from "@/lib/availableSeasons";

/** Grade de cartões do Figma: 4 colunas com 24 px de respiro (2 no celular, 3 no tablet). */
export function CardGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Box
      component="ul"
      aria-label={label}
      sx={{
        listStyle: "none",
        p: 0,
        m: 0,
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
        columnGap: 3,
        rowGap: 5,
        alignItems: "start",
      }}
    >
      {Children.map(children, (child) => (
        <li>{child}</li>
      ))}
    </Box>
  );
}

/** Cabeçalho de agrupamento: título de 24 px e uma nota (texto ou selo) à direita. */
export function SectionHeader({ title, note, chip = false }: { title: string; note?: ReactNode; chip?: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
      <Typography component="h2" sx={{ fontSize: 24, lineHeight: 1.5, color: "text.primary" }}>
        {title}
      </Typography>
      {note &&
        (chip ? (
          <Box sx={{ px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#171820" }}>
            <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "text.secondary", whiteSpace: "nowrap" }}>
              {note}
            </Typography>
          </Box>
        ) : (
          <Typography suppressHydrationWarning sx={{ fontSize: 13, color: "text.secondary" }}>
            {note}
          </Typography>
        ))}
    </Box>
  );
}

/** Estado "Carregando" (Figma Estados): esqueleto com a mesma geometria dos cartões. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box role="status" aria-label="Carregando" data-testid="explore-loading">
      <CardGrid>
        {Array.from({ length: count }, (_, i) => (
          <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Skeleton variant="rounded" animation="wave" sx={{ width: "100%", aspectRatio: "310 / 432", height: "auto", borderRadius: "12px", bgcolor: "#171820" }} />
            <Skeleton variant="text" width="70%" sx={{ fontSize: 20 }} />
            <Skeleton variant="text" width="45%" />
            <Skeleton variant="rounded" width={120} height={44} sx={{ borderRadius: "10px" }} />
          </Box>
        ))}
      </CardGrid>
    </Box>
  );
}

/** Estado "Vazio" (Figma "22 Empty"): ícone, frase curta, o motivo e a saída. */
export function EmptyPanel({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <Box sx={{ borderRadius: "16px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
      <EmptyState testId="explore-empty" icon={icon} title={title} action={action}>
        {children}
      </EmptyState>
    </Box>
  );
}

/** Fileira "TEMPORADAS": as quatro mais recentes (a atual primeiro), cada uma leva à página da temporada. */
export function SeasonChips({ exclude }: { exclude?: SeasonRef }) {
  // Só as temporadas que têm anime na plataforma; enquanto a lista não chega, as 4 mais recentes.
  const [available, setAvailable] = useState<AvailableSeason[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/seasons")
      .then((res) => (res.ok ? res.json() : { seasons: [] }))
      .then((data: { seasons?: AvailableSeason[] }) => {
        if (!cancelled) setAvailable(data.seasons ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const pool: SeasonRef[] = available ? available.slice(0, 6) : recentSeasons(new Date(), 4);
  const seasons = pool.filter((s) => !(exclude && s.season === exclude.season && s.year === exclude.year));
  return (
    <Box component="nav" aria-label="Temporadas" sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
      {!exclude && (
        <Typography component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
          TEMPORADAS
        </Typography>
      )}
      {seasons.map((s) => (
        <Button key={seasonSlug(s)} component={NextLink} href={`/temporada/${seasonSlug(s)}`} sx={ELEVATED_BUTTON_SX}>
          {seasonLabel(s)}
        </Button>
      ))}
    </Box>
  );
}
