"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { IconButton, Tooltip } from "@mui/material";

export function FavoriteToggle({
  animeId,
  initialFavorite,
}: {
  animeId: string;
  initialFavorite: boolean;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !isFavorite;
    setIsFavorite(next);
    setSaving(true);
    try {
      await fetch(`/api/anime/${animeId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const label = isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos";

  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          onClick={toggle}
          disabled={saving}
          aria-label={label}
          sx={{ color: isFavorite ? "secondary.main" : "text.secondary" }}
        >
          {isFavorite ? <StarIcon /> : <StarBorderIcon />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
