"use client";

import NextLink from "next/link";
import { Box } from "@mui/material";

const SECTIONS = [
  { href: "/", label: "Conversas", key: "feed" },
  { href: "/noticias", label: "Notícias", key: "news" },
] as const;

/**
 * Seções da Comunidade: "Conversas" (o feed) e "Notícias" (o que saiu sobre as
 * obras da temporada). São duas rotas de verdade, então voltar do navegador
 * restaura a seção; a atual leva `aria-current="page"`.
 */
export function CommunityNav({ current }: { current: "feed" | "news" }) {
  return (
    <Box component="nav" aria-label="Seções da Comunidade" sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      {SECTIONS.map((s) => {
        const active = s.key === current;
        return (
          <Box
            key={s.key}
            component={NextLink}
            href={s.href}
            aria-current={active ? "page" : undefined}
            data-testid={`community-section-${s.key}`}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              px: 2.5,
              borderRadius: "10px",
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
              bgcolor: active ? "primary.main" : "#171820",
              color: active ? "primary.contrastText" : "text.primary",
              "&:hover": { bgcolor: active ? "primary.main" : "#1d1e28" },
            }}
          >
            {s.label}
          </Box>
        );
      })}
    </Box>
  );
}
