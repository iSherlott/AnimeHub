"use client";

import { Typography } from "@mui/material";
import { useLocalizedDescription } from "@/lib/titlePreference";
import { htmlToPlainText } from "@/lib/plainText";

export function AnimeDescription({
  description,
  descriptionPortuguese,
}: {
  description: string;
  descriptionPortuguese?: string | null;
}) {
  const text = useLocalizedDescription(description, descriptionPortuguese);

  // Texto puro: a sinopse vem de terceiros (AniList) e/ou digitada pelo
  // usuário — nunca vira HTML na página (GAP-S-05).
  return (
    <Typography
      variant="body2"
      sx={{ maxWidth: 672, lineHeight: 1.7, color: "text.secondary", whiteSpace: "pre-wrap" }}
    >
      {htmlToPlainText(text)}
    </Typography>
  );
}
