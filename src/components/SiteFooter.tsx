"use client";

import { usePathname } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { useTimeZone } from "@/lib/useTimeZone";

/**
 * Rodapé do Figma ("Contrato da referência"): assinatura do produto à
 * esquerda e a data de hoje no fuso efetivo da pessoa à direita.
 */
export function SiteFooter() {
  const pathname = usePathname();
  const timeZone = useTimeZone();
  const today = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date())
    .replace(/\./g, "")
    .replace(",", "")
    .replace(/^./, (c) => c.toUpperCase());

  // A área Admin tem a própria casca (barra lateral + rodapé de revisão).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return (
    <Box
      component="footer"
      sx={{
        borderTop: 1,
        borderColor: "divider",
        px: { xs: 2, sm: 4, lg: 8 },
        py: 3,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 1,
        color: "text.secondary",
      }}
    >
      <Typography sx={{ fontSize: 12 }}>ANIME HUB · Sua próxima estreia, no seu tempo.</Typography>
      <Typography sx={{ fontSize: 12 }} suppressHydrationWarning>
        {today} · {timeZone}
      </Typography>
    </Box>
  );
}
