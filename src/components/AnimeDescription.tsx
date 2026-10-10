"use client";

import { Typography } from "@mui/material";
import { useSynopsis } from "@/components/SynopsisText";

export function AnimeDescription({
  description,
  descriptionPortuguese,
  anilistId,
}: {
  description: string;
  descriptionPortuguese?: string | null;
  anilistId?: number | null;
}) {
  const text = useSynopsis(description, anilistId, descriptionPortuguese);

  // Texto puro: a sinopse vem de terceiros (AniList) e/ou digitada pelo
  // usuário — nunca vira HTML na página (GAP-S-05).
  return (
    <Typography
      variant="body2"
      sx={{ maxWidth: 672, lineHeight: 1.7, color: "text.secondary", whiteSpace: "pre-wrap" }}
    >
      {text}
    </Typography>
  );
}
