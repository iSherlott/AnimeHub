"use client";

import NextLink from "next/link";
import { Link as MuiLink, Stack } from "@mui/material";

/**
 * Fileira de hashtags do Figma ("HashtagChip"): texto de 14 px na cor
 * primária, espaçamento de 16 px, cada uma levando à página da hashtag.
 */
export function HashtagRow({ tags }: { tags: Array<{ key: string; display: string }> }) {
  if (tags.length === 0) return null;
  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }} aria-label="Hashtags">
      {tags.map((t) => (
        <MuiLink
          key={t.key}
          component={NextLink}
          href={`/hashtag/${encodeURIComponent(t.key)}`}
          underline="hover"
          data-testid="hashtag-link"
          sx={{ fontSize: 14, color: "text.primary", whiteSpace: "nowrap" }}
        >
          #{t.display}
        </MuiLink>
      ))}
    </Stack>
  );
}
