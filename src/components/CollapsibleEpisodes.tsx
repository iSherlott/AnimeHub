"use client";

import { useId, useState, type ReactNode } from "react";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Button, Collapse, Stack, Typography } from "@mui/material";

/**
 * A lista de episódios de uma obra, minimizada por padrão: só o cabeçalho (com a contagem) aparece, e o botão abre e fecha a
 * linha do tempo. Compartilhada pela página de quem acompanha a obra e pela pública.
 */
export function CollapsibleEpisodes({ summary, accentColor, defaultOpen = false, children }: { summary: string; accentColor?: string | null; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <Box data-testid="episode-list" sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box aria-hidden sx={{ width: 6, height: 16, bgcolor: accentColor ?? "primary.main", transform: "skewX(-12deg)", flexShrink: 0 }} />
          <Typography variant="body2" data-testid="episode-count" sx={{ fontWeight: 700 }}>
            {summary}
          </Typography>
        </Stack>
        <Button size="small" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={bodyId} data-testid="episode-toggle" endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />} sx={{ flexShrink: 0, textTransform: "none", fontWeight: 700 }}>
          {open ? "Minimizar episódios" : "Mostrar episódios"}
        </Button>
      </Stack>
      <Collapse in={open} id={bodyId}>
        {children}
      </Collapse>
    </Box>
  );
}
