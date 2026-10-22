import { Box, Skeleton } from "@mui/material";
import { VerticalTimeline } from "@/components/VerticalTimeline";

/** Esqueleto da linha do tempo de episódios enquanto eles carregam (a lista vem da fonte e pode demorar). */
export function EpisodesSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Box role="status" aria-busy="true" aria-label="Carregando os episódios" data-testid="episodes-skeleton">
      <VerticalTimeline
        label="Carregando os episódios"
        nodes={Array.from({ length: rows }, (_, i) => ({
          key: `sk-${i}`,
          tone: "upcoming" as const,
          children: (
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Skeleton variant="rectangular" animation="wave" sx={{ width: { xs: 112, sm: 160 }, aspectRatio: "16 / 9", height: "auto", flexShrink: 0, borderRadius: 1 }} />
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 0.5 }}>
                <Skeleton variant="text" animation="wave" width="70%" sx={{ fontSize: 16 }} />
                <Skeleton variant="text" animation="wave" width="40%" sx={{ fontSize: 12 }} />
              </Box>
            </Box>
          ),
        }))}
      />
    </Box>
  );
}
