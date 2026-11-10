"use client";

import { useState } from "react";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import FavoriteIcon from "@mui/icons-material/Favorite";
import { Alert, Box, Button } from "@mui/material";

/** Põe ou tira o personagem dos favoritos do perfil (até 5). */
export function FavoriteCharacterButton({ characterId, initial }: { characterId: number; initial: boolean }) {
  const [favorite, setFavorite] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/favorite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorite: !favorite }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Não foi possível salvar.");
      else setFavorite(!favorite);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-start" }}>
      <Button variant={favorite ? "contained" : "outlined"} startIcon={favorite ? <FavoriteIcon /> : <FavoriteBorderIcon />} onClick={() => void toggle()} disabled={busy} aria-pressed={favorite} data-testid="favorite-character">
        {favorite ? "Favorito no perfil" : "Favoritar no perfil"}
      </Button>
      {error && (
        <Alert severity="warning" role="alert">
          {error}
        </Alert>
      )}
    </Box>
  );
}
