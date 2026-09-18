"use client";

import { Typography } from "@mui/material";
import { useLocalizedDescription } from "@/lib/titlePreference";

export function AnimeDescription({
  description,
  descriptionPortuguese,
}: {
  description: string;
  descriptionPortuguese?: string | null;
}) {
  const html = useLocalizedDescription(description, descriptionPortuguese);

  return (
    <Typography
      variant="body2"
      sx={{ maxWidth: 672, lineHeight: 1.7, color: "text.secondary" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
