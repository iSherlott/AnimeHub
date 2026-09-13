"use client";

import NextLink from "next/link";
import { Chip, Stack } from "@mui/material";

export type SeasonEntry = {
  id: string;
  seasonNumber: number;
  titleRomaji: string;
};

export function SeasonSwitcher({
  currentId,
  seasons,
}: {
  currentId: string;
  seasons: SeasonEntry[];
}) {
  if (seasons.length <= 1) return null;

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
      {seasons.map((s) => (
        <Chip
          key={s.id}
          component={NextLink}
          href={`/anime/${s.id}`}
          clickable
          label={`Temporada ${s.seasonNumber}`}
          color={s.id === currentId ? "primary" : "default"}
          size="small"
          sx={{ fontWeight: 700, textTransform: "uppercase" }}
        />
      ))}
    </Stack>
  );
}
