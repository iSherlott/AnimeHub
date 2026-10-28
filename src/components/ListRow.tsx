"use client";

import { useState, type ReactNode } from "react";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { Box, ButtonBase, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { lineLang, PrimaryTitle, useTitleLines } from "@/components/ExploreCard";
import { WorkPreview, type WorkPreviewInfo } from "@/components/WorkPreview";
import { WorkPreviewShell } from "@/components/WorkPreviewShell";
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
 * selo de novo episódio e, à direita, a ação. Com `linkWhole` a linha toda abre
 * a prévia da obra (seta ↗); sem ele, a capa e o título abrem a prévia e
 * `trailing` traz a ação. A página da obra fica no botão dentro da prévia.
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
  preview,
  previewActions,
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
  /** Mais dados para a prévia (sinopse, gêneros, informações). */
  preview?: Omit<WorkPreviewInfo, "titles" | "coverImage" | "href">;
  /** Ações dentro da prévia, além de "Ver página da obra". */
  previewActions?: ReactNode;
}) {
  const titleLines = useTitleLines(titles);
  const { secondary, primaryLang } = titleLines;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const openPreview = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);

  const content = (
    <>
      <Box data-testid={timeTestId} sx={{ minWidth: 0, gridColumn: { xs: "1 / -1", md: "auto" } }}>
        <Typography suppressHydrationWarning component="div" sx={{ fontSize: { xs: 20, md: 28 }, lineHeight: 1.3, color: "text.primary" }}>
          {time}
        </Typography>
        {episodeLabel && (
          <Typography component="div" sx={{ fontSize: 12, lineHeight: 1.5, color: "text.secondary", textTransform: "uppercase" }}>
            {episodeLabel}
          </Typography>
        )}
      </Box>
      <Box aria-hidden onClick={linkWhole ? undefined : openPreview} sx={{ position: "relative", width: 56, height: 80, borderRadius: "6px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0, cursor: "pointer" }}>
        {cover && <CoverImage src={cover} sizes="56px" />}
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25 }}>
        <Typography lang={primaryLang} sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {linkWhole ? (
            <PrimaryTitle lines={titleLines} />
          ) : (
            <ButtonBase
              onClick={openPreview}
              aria-haspopup="dialog"
              aria-expanded={Boolean(anchorEl)}
              sx={{ font: "inherit", color: "inherit", textAlign: "left", display: "inline", borderRadius: "4px", "&:hover": { textDecoration: "underline" }, "&.Mui-focusVisible": { outline: "2px solid #ffd400", outlineOffset: 2 } }}
            >
              <PrimaryTitle lines={titleLines} />
            </ButtonBase>
          )}
        </Typography>
        {secondary.map((line, i) => (
          <Typography key={line} lang={lineLang(line)} sx={{ fontSize: i === 0 ? 12 : 13, lineHeight: 1.5, color: "text.secondary" }}>
            {line}
          </Typography>
        ))}
      </Box>
      {badge && <Box sx={{ display: { xs: "none", md: "block" } }}>{badge}</Box>}
      {linkWhole ? (
        <ArrowOutwardIcon aria-hidden sx={{ fontSize: 18, color: "text.secondary", display: { xs: "none", md: "block" } }} />
      ) : trailing ? (
        <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, justifySelf: { xs: "start", md: "auto" } }}>{trailing}</Box>
      ) : null}
    </>
  );

  const sx = {
    display: "grid",
    // No celular: o horário numa linha, a capa e o título na seguinte e a ação embaixo (lado a lado, o título ficava
    // espremido numa coluna de poucos pixels).
    gridTemplateColumns: { xs: "56px minmax(0, 1fr)", md: "148px 56px minmax(0, 1fr) auto auto" },
    alignItems: "center",
    columnGap: { xs: 2, md: 3 },
    rowGap: { xs: 1.5, md: 0 },
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
        <ButtonBase
          component="div"
          onClick={openPreview}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchorEl)}
          sx={{ ...sx, width: "100%", textAlign: "left", justifyContent: "stretch", transition: "border-color 0.15s ease", "&:hover": { borderColor: "text.secondary" }, "&.Mui-focusVisible": { outline: "2px solid #ffd400", outlineOffset: 2 } }}
        >
          {content}
        </ButtonBase>
      ) : (
        <Box sx={sx}>{content}</Box>
      )}
      <WorkPreviewShell open={Boolean(anchorEl)} anchorEl={anchorEl} pinned onClose={() => setAnchorEl(null)} label={`Prévia de ${titleLines.primary}`}>
        <WorkPreview info={{ meta: [episodeLabel], ...preview, titles, coverImage: cover, href }} actions={previewActions} />
      </WorkPreviewShell>
    </Box>
  );
}
