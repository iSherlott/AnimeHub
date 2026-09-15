"use client";

import NextLink from "next/link";
import Image from "next/image";
import { useState } from "react";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, Tooltip, Typography } from "@mui/material";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

export type RecommendationData = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
  /** Já resolvido no servidor (anime/[id]/page.tsx): link interno quando o
   * anime recomendado já está na lista do usuário, senão externo pra
   * AniList — mesmo padrão de CalendarEntryCard. */
  href: string;
  isInternal: boolean;
};

export function RecommendationCard({ rec }: { rec: RecommendationData }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, {
    titleRomaji: rec.titleRomaji,
    titleEnglish: rec.titleEnglish,
  });
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de capa
  // que 404 (achado real da 6ª rodada de auditoria, Epic 18).
  const [coverBroken, setCoverBroken] = useState(false);

  return (
    <Tooltip title={title}>
      <Box
        component={rec.isInternal ? NextLink : "a"}
        href={rec.href}
        target={rec.isInternal ? undefined : "_blank"}
        rel={rec.isInternal ? undefined : "noopener noreferrer"}
        sx={{ display: "block", width: 128, flexShrink: 0, textDecoration: "none", color: "inherit" }}
      >
        <Box
          sx={{
            position: "relative",
            aspectRatio: "2 / 3",
            width: "100%",
            overflow: "hidden",
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {rec.coverImage && !coverBroken && (
            <Image
              src={rec.coverImage}
              alt=""
              fill
              sizes="128px"
              style={{ objectFit: "cover" }}
              onError={() => setCoverBroken(true)}
            />
          )}
          {!rec.isInternal && (
            <Box
              aria-hidden="true"
              sx={{
                position: "absolute",
                right: 4,
                top: 4,
                display: "flex",
                height: 20,
                width: 20,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                bgcolor: "rgba(0,0,0,0.7)",
                color: "text.primary",
              }}
            >
              <OpenInNewIcon sx={{ fontSize: 13 }} />
            </Box>
          )}
        </Box>
        <Typography variant="caption" noWrap sx={{ display: "block", mt: 0.5 }}>
          {title}
        </Typography>
      </Box>
    </Tooltip>
  );
}
