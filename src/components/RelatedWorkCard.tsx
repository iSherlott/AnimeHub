"use client";

import NextLink from "next/link";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { Box, Button, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { WorkPreviewTrigger } from "@/components/WorkPreview";
import { formatTimeInZone, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

/**
 * Obra relacionada do Figma ("Anime Card / Normal", `13:42544`): capa de
 * 2:3 com raio 12, título original em negrito, inglês secundário, próximo
 * horário (ou "Data não definida") e "+ Acompanhar" (leva ao detalhe público,
 * onde o vínculo é confirmado — nunca cria acompanhamento por clique solto).
 */
export function RelatedWorkCard({
  anilistId,
  coverImage,
  titleNative,
  titleRomaji,
  titleEnglish,
  nextAiringAt,
  note,
}: {
  anilistId: number;
  coverImage: string | null;
  titleNative: string | null;
  titleRomaji: string;
  titleEnglish: string | null;
  nextAiringAt: string | null;
  /** Rótulo da relação quando não há horário (ex.: "Continuação"). */
  note?: string;
}) {
  const timeZone = useTimeZone();
  const when = nextAiringAt
    ? (() => {
        const d = new Date(nextAiringAt);
        return `${weekdayName(d, timeZone)} · ${formatTimeInZone(d, timeZone)}`;
      })()
    : (note ?? "Data não definida");
  const primary = titleNative ?? titleRomaji;
  const secondary = titleEnglish && titleEnglish !== primary ? titleEnglish : titleNative ? titleRomaji : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      {/* Capa, título e horário abrem a prévia; a página da obra fica no botão dentro dela. */}
      <WorkPreviewTrigger
        label={primary}
        testId={`related-open-${anilistId}`}
        info={{ titles: { titleRomaji, titleEnglish, titleNative }, coverImage, href: `/anime/${anilistId}`, anilistId, meta: [when] }}
        sx={{ display: "flex", flexDirection: "column", gap: 2, "&:hover .related-title": { textDecoration: "underline" } }}
      >
        <Box sx={{ position: "relative", aspectRatio: "2 / 3", borderRadius: "12px", overflow: "hidden", bgcolor: "#171820" }}>
          {coverImage && <CoverImage src={coverImage} sizes="280px" />}
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography className="related-title" lang={titleNative ? "ja" : undefined} sx={{ fontSize: { xs: 16, sm: 20 }, fontWeight: 700, lineHeight: 1.4, overflowWrap: "anywhere" }}>
            {primary}
          </Typography>
          {secondary && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{secondary}</Typography>}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ScheduleIcon sx={{ fontSize: 16 }} />
          <Typography suppressHydrationWarning sx={{ fontSize: 14 }}>
            {when}
          </Typography>
        </Box>
      </WorkPreviewTrigger>
      <Box>
        <Button component={NextLink} href={`/anime/${anilistId}`} sx={{ bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } }}>
          + Acompanhar
        </Button>
      </Box>
    </Box>
  );
}
