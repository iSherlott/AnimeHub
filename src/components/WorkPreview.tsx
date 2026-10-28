"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import { Box, Button, ButtonBase, Typography, type SxProps, type Theme } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { lineLang, PrimaryTitle, useTitleLines } from "@/components/ExploreCard";
import { useSynopsis } from "@/components/SynopsisText";
import { WorkPreviewShell } from "@/components/WorkPreviewShell";
import type { TitleSet } from "@/lib/titlePreference";

const actionSx = { bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } };

/** O que a prévia de uma obra mostra. Tudo opcional além dos títulos e do endereço da página. */
export type WorkPreviewInfo = {
  titles: TitleSet;
  coverImage: string | null;
  /** Página da obra (nula quando a obra ainda não tem uma). */
  href: string | null;
  description?: string | null;
  anilistId?: number | null;
  genres?: string[];
  /** Linha de informações curtas: situação, episódios, temporada, horário… */
  meta?: Array<string | null | undefined>;
};

/**
 * Conteúdo da prévia de uma obra (Explorar, temporada, Dashboard, Minha Lista, álbuns, relacionadas): capa, títulos,
 * informações, sinopse, gêneros, as ações do lugar e o botão "Ver página da obra".
 */
export function WorkPreview({ info, actions, testId }: { info: WorkPreviewInfo; actions?: ReactNode; testId?: string }) {
  const lines = useTitleLines(info.titles);
  const synopsis = useSynopsis(info.description, info.anilistId);
  const meta = (info.meta ?? []).filter((m): m is string => Boolean(m));
  return (
    <Box sx={{ width: { xs: "100%", sm: 360 }, display: "flex", flexDirection: "column", gap: 1.5, p: 2, boxSizing: "border-box" }} data-testid={testId ?? "work-preview"}>
      <Box sx={{ display: "flex", gap: 2 }}>
        <Box sx={{ position: "relative", flexShrink: 0, width: 88, aspectRatio: "2 / 3", borderRadius: "8px", overflow: "hidden", bgcolor: "background.default" }}>
          {info.coverImage && <CoverImage src={info.coverImage} sizes="88px" />}
        </Box>
        <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography lang={lines.primaryLang} sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35, overflowWrap: "anywhere" }}>
            <PrimaryTitle lines={lines} />
          </Typography>
          {lines.secondary.map((t) => (
            <Typography key={t} lang={lineLang(t)} sx={{ fontSize: 12, color: "text.secondary", overflowWrap: "anywhere" }}>
              {t}
            </Typography>
          ))}
          {meta.length > 0 && <Typography sx={{ fontSize: 12, fontWeight: 700, color: "primary.light" }}>{meta.join(" · ")}</Typography>}
        </Box>
      </Box>
      {synopsis && (
        <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {synopsis}
        </Typography>
      )}
      {info.genres && info.genres.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {info.genres.slice(0, 4).map((g) => (
            <Typography key={g} component="span" sx={{ px: 1, py: 0.5, borderRadius: "6px", bgcolor: "background.paper", fontSize: 10, fontWeight: 700 }}>
              {g}
            </Typography>
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        {info.href && (
          <Button component={NextLink} href={info.href} size="small" startIcon={<ArrowOutwardIcon />} sx={actionSx}>
            Ver página da obra
          </Button>
        )}
        {actions}
      </Box>
    </Box>
  );
}

/**
 * Área tocável que abre a prévia (no celular, a gaveta de baixo; do tablet em diante, o cartão ao lado). Envolve a capa
 * e/ou o título de um cartão; dentro dela não pode haver outro link ou botão.
 */
export function WorkPreviewTrigger({
  info,
  actions,
  label,
  children,
  testId,
  sx,
  inline = false,
}: {
  info: WorkPreviewInfo;
  actions?: ReactNode;
  /** Nome da obra para "Prévia de …" (o nome do botão vem do próprio conteúdo: capa, título, horário). */
  label: string;
  children: ReactNode;
  testId?: string;
  sx?: SxProps<Theme>;
  /** Dentro de um texto (ex.: o título num <p>): vira <span>, porque um <div> dentro de <p> quebra a hidratação. */
  inline?: boolean;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <>
      <ButtonBase
        component={inline ? "span" : "div"}
        onClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchorEl)}
        data-testid={testId}
        // O ButtonBase centraliza os filhos por padrão: sem esticar, a capa (proporção pela largura) ficava com altura zero.
        sx={[{ display: "block", width: "100%", alignItems: "stretch", justifyContent: "flex-start", textAlign: "left", color: "inherit", borderRadius: "8px", "&.Mui-focusVisible": { outline: "2px solid #ffd400", outlineOffset: 2 } }, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        {children}
      </ButtonBase>
      <WorkPreviewShell open={Boolean(anchorEl)} anchorEl={anchorEl} pinned onClose={() => setAnchorEl(null)} label={`Prévia de ${label}`}>
        <WorkPreview info={info} actions={actions} />
      </WorkPreviewShell>
    </>
  );
}
