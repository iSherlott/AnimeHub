"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { Box, Link as MuiLink, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { lineLang, PrimaryTitle, useTitleLines } from "@/components/ExploreCard";
import type { TitleSet } from "@/lib/titlePreference";

/** Selo "NOVO EPISÓDIO EP03" (Figma `10:28`): ícone de brilho + 11 px bold em acento. */
export function NewEpisodeBadge({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, color: "primary.main" }}>
      <AutoAwesomeIcon sx={{ fontSize: 14 }} />
      <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "inherit", whiteSpace: "nowrap" }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * Linha de lançamento do Figma (Dashboard `8:2442` e Minha Lista `8:2608`):
 * horário grande + "EPISÓDIO 03", miniatura, títulos (nativo em destaque),
 * selo de novo episódio e, à direita, a ação. Com `linkWhole` a linha toda é
 * um link (seta ↗); sem ele, só o título é link e `trailing` traz a ação.
 */
export function ListRow({
  testId,
  href,
  time,
  episodeLabel,
  timeTestId,
  cover,
  titles,
  highlighted = false,
  badge,
  trailing,
  linkWhole = false,
}: {
  testId?: string;
  href: string;
  time: ReactNode;
  episodeLabel?: string;
  timeTestId?: string;
  cover: string | null;
  titles: TitleSet;
  highlighted?: boolean;
  badge?: ReactNode;
  trailing?: ReactNode;
  linkWhole?: boolean;
}) {
  const titleLines = useTitleLines(titles);
  const { secondary, primaryLang } = titleLines;

  const content = (
    <>
      <Box data-testid={timeTestId} sx={{ minWidth: 0 }}>
        <Typography suppressHydrationWarning component="div" sx={{ fontSize: { xs: 20, md: 28 }, lineHeight: 1.3, color: "text.primary" }}>
          {time}
        </Typography>
        {episodeLabel && (
          <Typography component="div" sx={{ fontSize: 12, lineHeight: 1.5, color: "text.secondary", textTransform: "uppercase" }}>
            {episodeLabel}
          </Typography>
        )}
      </Box>
      <Box aria-hidden sx={{ position: "relative", width: 56, height: 80, borderRadius: "6px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>
        {cover && <CoverImage src={cover} sizes="56px" />}
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25 }}>
        <Typography lang={primaryLang} sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {linkWhole ? (
            <PrimaryTitle lines={titleLines} />
          ) : (
            <MuiLink component={NextLink} href={href} underline="hover" color="inherit">
              <PrimaryTitle lines={titleLines} />
            </MuiLink>
          )}
        </Typography>
        {secondary.map((line, i) => (
          <Typography key={line} lang={lineLang(line)} sx={{ fontSize: i === 0 ? 12 : 13, lineHeight: 1.5, color: "text.secondary" }}>
            {line}
          </Typography>
        ))}
      </Box>
      {badge && <Box sx={{ display: { xs: "none", md: "block" } }}>{badge}</Box>}
      {linkWhole ? <ArrowOutwardIcon aria-hidden sx={{ fontSize: 18, color: "text.secondary" }} /> : trailing}
    </>
  );

  const sx = {
    display: "grid",
    gridTemplateColumns: { xs: "84px 48px minmax(0, 1fr) auto", md: "148px 56px minmax(0, 1fr) auto auto" },
    alignItems: "center",
    columnGap: { xs: 2, md: 3 },
    px: { xs: 2, md: 3 },
    py: 2.5,
    minHeight: 120,
    boxSizing: "border-box",
    borderRadius: "12px",
    border: 1,
    borderColor: highlighted ? "#4a1a2a" : "divider",
    bgcolor: highlighted ? "#2c111b" : "background.paper",
    color: "text.primary",
    textDecoration: "none",
  } as const;

  return (
    <Box component="li" data-testid={testId} sx={{ listStyle: "none" }}>
      {linkWhole ? (
        <Box component={NextLink} href={href} sx={{ ...sx, transition: "border-color 0.15s ease", "&:hover": { borderColor: "text.secondary" } }}>
          {content}
        </Box>
      ) : (
        <Box sx={sx}>{content}</Box>
      )}
    </Box>
  );
}
