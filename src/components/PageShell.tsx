import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

/**
 * Casca de página do Figma "14 — Community UX": área central de 1440 px com
 * 128 px de margem lateral (conteúdo de 1184 px) e respiro de 48/64 px em
 * cima/embaixo; em telas menores a margem encolhe de forma responsiva.
 */
export function PageContainer({ children, wide = false, fluid = false }: { children: ReactNode; wide?: boolean; fluid?: boolean }) {
  return (
    <Box
      sx={{
        width: "100%",
        // fluid: sem teto de 1440 px (a agenda semanal usa a tela toda, inclusive ultrawide).
        maxWidth: fluid ? "none" : 1440,
        mx: "auto",
        px: { xs: 2, sm: 4, md: 8, lg: wide || fluid ? 8 : 16 },
        pt: { xs: 4, md: 6 },
        pb: { xs: 6, md: 8 },
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Introdução de página: kicker em japonês/português na cor de acento, título
 * de 40 px, subtítulo secundário e uma ação opcional alinhada à base, à direita.
 */
export function PageIntro({
  kicker,
  title,
  subtitle,
  action,
  titleLang,
}: {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  titleLang?: string;
}) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "flex-end", justifyContent: "space-between" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: "1 1 320px" }}>
        <Typography component="p" lang="ja" sx={{ color: "primary.main", fontSize: 12, fontWeight: 700 }}>
          {kicker}
        </Typography>
        <Typography component="h1" lang={titleLang} sx={{ fontSize: { xs: 32, md: 40 }, fontWeight: 400, lineHeight: 1.2, color: "text.primary" }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography component="p" sx={{ color: "text.secondary", fontSize: 16 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}

/**
 * Duas colunas do Figma: conteúdo principal de 824 px + 40 px de espaço +
 * lateral de 320 px (largura útil de 1184 px). Abaixo de "lg" empilha, com
 * a lateral depois do conteúdo.
 */
export function TwoColumn({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" },
        columnGap: 5,
        rowGap: 5,
        alignItems: "start",
      }}
    >
      <Box sx={{ minWidth: 0 }}>{main}</Box>
      <Box component="aside" sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {aside}
      </Box>
    </Box>
  );
}

/** Título de seção lateral/secundária: Inter 20, cor primária. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography component="h2" sx={{ fontSize: 20, lineHeight: 1.5, color: "text.primary" }}>
      {children}
    </Typography>
  );
}
