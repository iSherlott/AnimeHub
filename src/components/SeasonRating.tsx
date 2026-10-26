"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Rating, Typography } from "@mui/material";

/**
 * Nota que a pessoa dá a uma temporada que está na lista dela: 5 estrelas em meios pontos (cada estrela vale 2 pontos, de 1
 * a 10). Dá para avaliar enquanto acompanha; a nota só entra na nota do site quando a pessoa termina a temporada. Clicar de
 * novo na mesma nota tira a avaliação.
 */
export function SeasonRating({ animeId, anilistId, seasonNumber, score, finished }: { animeId: string; /** Chave dos testids e do grupo de estrelas: o AniList ID ou `anidb-<id>`. */ anilistId: number | string; seasonNumber: number; score: number | null; finished: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(score === null ? null : score / 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: number | null) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${animeId}/score`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: next === null ? null : Math.round(next * 2) }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setValue(previous);
        setError(data.error ?? "Não foi possível salvar a nota.");
        return;
      }
      router.refresh();
    } catch {
      setValue(previous);
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box data-testid={`season-score-${anilistId}`} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Rating
          name={`score-${anilistId}`}
          value={value}
          precision={0.5}
          max={5}
          disabled={busy}
          onChange={(_, next) => void save(next)}
          getLabelText={(stars) => `${stars} ${stars === 1 ? "estrela" : "estrelas"} (nota ${stars * 2})`}
          aria-label={`Sua nota para a Temporada ${seasonNumber}`}
          sx={{ color: "primary.main" }}
        />
        <Typography data-testid={`season-score-value-${anilistId}`} sx={{ fontSize: 13, color: "text.secondary" }}>
          {value === null ? "Sem nota" : `Sua nota: ${Math.round(value * 2)}/10`}
        </Typography>
      </Box>
      {!finished && (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Sua nota entra na nota do site quando você terminar a temporada.</Typography>
      )}
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
