import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

/** Cartão da lateral da página da obra (Epic 49): um título e o conteúdo (ficha, onde assistir, sua lista…). */
export function WorkCard({ title, id, testId, children }: { title: string; id?: string; testId?: string; children: ReactNode }) {
  return (
    <Box component="section" id={id} aria-label={title} data-testid={testId} sx={{ bgcolor: "background.paper", borderRadius: "16px", p: 2.5, display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
      <Typography component="h2" sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** A ficha da obra: pares rótulo/valor numa lista de definição. Linhas sem valor ficam de fora. */
export function WorkInfoList({ rows }: { rows: Array<[string, ReactNode | null | undefined]> }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  return (
    <Box component="dl" data-testid="work-info" sx={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", columnGap: 2, rowGap: 0.75, m: 0, fontSize: 14 }}>
      {shown.map(([label, value]) => (
        <Box key={label} sx={{ display: "contents" }}>
          <Typography component="dt" sx={{ fontSize: 14, color: "text.secondary" }}>
            {label}
          </Typography>
          <Typography component="dd" sx={{ fontSize: 14, m: 0, overflowWrap: "anywhere" }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** As etiquetas curtas do topo (tipo, situação, época, episódios). */
export function WorkBadgeRow({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;
  return (
    <Box component="ul" data-testid="work-badges" sx={{ display: "flex", flexWrap: "wrap", gap: 1, listStyle: "none", m: 0, p: 0 }}>
      {badges.map((b) => (
        <Box component="li" key={b} sx={{ px: 1.25, py: 0.4, borderRadius: "999px", border: 1, borderColor: "divider", bgcolor: "rgba(255,255,255,0.04)", fontSize: 12.5, fontWeight: 600, color: "text.primary" }}>
          {b}
        </Box>
      ))}
    </Box>
  );
}
