"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button, Typography } from "@mui/material";

const SOURCE_LABELS: Record<string, string> = {
  anilist: "AniList",
  kitsu: "Kitsu",
  jikan: "Jikan (MAL)",
  shikimori: "Shikimori",
  anidb: "AniDB",
};

export function RefreshDataButton({ animeId }: { animeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);

  async function refresh() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/anime/${animeId}/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setResult(data.status);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Button
        onClick={refresh}
        loading={loading}
        loadingPosition="start"
        startIcon={<RefreshIcon fontSize="small" />}
        size="small"
        variant="outlined"
        sx={{ width: "fit-content" }}
        title="Busca dados atualizados na AniList, Kitsu, Jikan (MyAnimeList), Shikimori e AniDB (se configurada)"
      >
        {loading ? "Atualizando..." : "Atualizar dados"}
      </Button>
      {result && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {Object.entries(result)
            .map(([source, s]) => `${SOURCE_LABELS[source] ?? source}: ${s}`)
            .join(" · ")}
        </Typography>
      )}
    </Box>
  );
}
