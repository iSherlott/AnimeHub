"use client";

import { useState } from "react";
import { TextField } from "@mui/material";
import { InlineEditField } from "@/components/InlineEditField";

export function SeriesGroupEditor({
  animeId,
  seriesKey,
  seasonNumber,
}: {
  animeId: string;
  seriesKey: string;
  seasonNumber: number;
}) {
  const [key, setKey] = useState(seriesKey);
  const [season, setSeason] = useState(seasonNumber);

  async function save() {
    const res = await fetch(`/api/anime/${animeId}/series`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesKey: key, seasonNumber: season }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Falha ao salvar");
    }
  }

  return (
    <InlineEditField
      triggerLabel="Editar agrupamento de temporada"
      onSave={save}
      onCancel={() => {
        setKey(seriesKey);
        setSeason(seasonNumber);
      }}
    >
      <TextField
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="chave da franquia (ex: jujutsu kaisen)"
        size="small"
        sx={{ width: 224 }}
      />
      <TextField
        type="number"
        value={season}
        onChange={(e) => setSeason(Number(e.target.value))}
        size="small"
        aria-label="Número da temporada"
        slotProps={{ htmlInput: { min: 1 } }}
        sx={{ width: 80 }}
      />
    </InlineEditField>
  );
}
