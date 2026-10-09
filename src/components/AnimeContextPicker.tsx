"use client";

import { useEffect, useState } from "react";
import { Autocomplete, Chip, CircularProgress, TextField, Typography } from "@mui/material";

export type RelatedAnime = { anilistId: number; title: string };

type SearchResult = {
  anilistId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
};

/**
 * "Anime relacionado — Opcional" (Figma `13:41840`, `13:41925`): a obra é
 * escolhida de forma EXPLÍCITA numa busca por kanji, kana, romaji ou inglês;
 * mencionar um nome ou hashtag no texto nunca cria associação. Uma vez
 * escolhida, aparece como chip removível ("Remover associação").
 */
export function AnimeContextPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: RelatedAnime | null;
  onChange: (next: RelatedAnime | null) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<RelatedAnime[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = input.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setOptions([]);
        return;
      }
      setLoading(true);
      fetch(`/api/anilist/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data: { results?: SearchResult[] }) => {
          if (cancelled) return;
          setOptions(
            (data.results ?? [])
              .filter((r): r is SearchResult & { anilistId: number } => typeof r.anilistId === "number")
              .slice(0, 8)
              .map((r) => ({ anilistId: r.anilistId, title: r.titleEnglish || r.titleRomaji }))
          );
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, q.length < 2 ? 0 : 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  if (value) {
    return (
      <Chip
        data-testid="related-anime-chip"
        label={`Sobre: ${value.title}`}
        onDelete={disabled ? undefined : () => onChange(null)}
        deleteIcon={<span aria-label="Remover associação" role="img">✕</span>}
        size="small"
        variant="outlined"
        sx={{ alignSelf: "flex-start", maxWidth: "100%" }}
      />
    );
  }

  return (
    <Autocomplete<RelatedAnime>
      size="small"
      options={options}
      loading={loading}
      disabled={disabled}
      value={null}
      inputValue={input}
      onInputChange={(_, v, reason) => {
        if (reason !== "reset") setInput(v);
      }}
      onChange={(_, next) => {
        if (next) {
          onChange(next);
          setInput("");
        }
      }}
      filterOptions={(opts) => opts}
      getOptionLabel={(o) => o.title}
      isOptionEqualToValue={(a, b) => a.anilistId === b.anilistId}
      noOptionsText={input.trim().length < 2 ? "Digite ao menos 2 letras" : "Nenhum anime encontrado"}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Anime relacionado (opcional)"
          placeholder="Kanji, kana, romaji ou título em inglês"
          helperText={
            <Typography component="span" variant="caption">
              Escolha a obra certa; mencionar um nome no texto não cria uma associação.
            </Typography>
          }
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading ? <CircularProgress size={16} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
