"use client";

import { Typography } from "@mui/material";
import { useSynopsisState, type StoredSynopsis } from "@/components/SynopsisText";

export function AnimeDescription({
  description,
  descriptionPortuguese,
  anilistId,
  stored,
}: {
  description: string;
  descriptionPortuguese?: string | null;
  anilistId?: number | null;
  stored?: StoredSynopsis;
}) {
  const { text, status } = useSynopsisState(description, anilistId, descriptionPortuguese, stored);

  // Texto puro: a sinopse vem de terceiros (AniList) e/ou digitada pelo
  // usuário — nunca vira HTML na página (GAP-S-05).
  return (
    <>
      <Typography
        variant="body2"
        aria-busy={status === "pending" || undefined}
        sx={{ maxWidth: 672, lineHeight: 1.7, color: "text.secondary", whiteSpace: "pre-wrap", ...(status === "pending" ? { fontStyle: "italic" } : {}) }}
      >
        {text}
      </Typography>
      {status === "unavailable" && (
        <Typography variant="caption" data-testid="synopsis-untranslated" sx={{ color: "text.secondary" }}>
          Sinopse original, em inglês: a tradução não está disponível agora.
        </Typography>
      )}
    </>
  );
}
