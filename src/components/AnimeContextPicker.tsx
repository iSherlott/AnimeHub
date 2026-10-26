"use client";

import { useEffect, useId, useState } from "react";
import SearchIcon from "@mui/icons-material/Search";
import { Autocomplete, Box, ButtonBase, CircularProgress, TextField, Typography } from "@mui/material";

export type RelatedAnime = {
  /** Nulo = obra sem AniList ID (só do AniDB/Kitsu): vai pela chave `work`. */
  anilistId: number | null;
  /** Chave da obra: o AniList ID ou `anidb-<id>`/`kitsu-<id>`. */
  work: string;
  title: string;
  /** Detalhes mostrados quando a obra veio do detalhe público (Figma 13:41925). */
  native?: string | null;
  english?: string | null;
  meta?: string | null;
  fromDetail?: boolean;
};

type SearchResult = {
  key?: string;
  anilistId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
};

/**
 * "Anime relacionado" (Figma `13:41840`, `13:41925`): a obra é escolhida de
 * forma EXPLÍCITA numa busca por kanji, kana, romaji ou inglês; mencionar um
 * nome ou hashtag no texto nunca cria associação. Uma vez escolhida, aparece
 * como bloco com "Remover associação". Visual: rótulo de 12 px semi-negrito e
 * campo "surface" com borda, raio 10 e lupa.
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
  const labelId = useId();

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
              // Obra da AniList ou, sem AniList ID, a do catálogo (`anidb-<id>`); a que não tem nenhum dos dois fica de fora.
              .filter((r) => typeof r.anilistId === "number" || /^(anidb|kitsu)-\d+$/.test(r.key ?? ""))
              .slice(0, 8)
              .map((r) => ({ anilistId: r.anilistId, work: r.anilistId !== null ? String(r.anilistId) : (r.key as string), title: r.titleEnglish || r.titleRomaji }))
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
    const buttonSx = { bgcolor: "#171820", color: "text.primary", fontSize: 14, fontWeight: 700, minHeight: 44, px: 2, borderRadius: "10px", "&:hover": { bgcolor: "#1d1e28" } } as const;
    return (
      <Box
        data-testid="related-anime-chip"
        sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "12px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}
      >
        {value.fromDetail && <Typography sx={{ fontSize: 12, fontWeight: 700 }}>✓ Selecionado a partir do detalhe</Typography>}
        <Box>
          <Typography lang={value.native ? "ja" : undefined} sx={{ fontSize: value.fromDetail ? 20 : 14, fontWeight: 700 }}>
            {value.fromDetail ? (value.native ?? value.title) : `Sobre: ${value.title}`}
          </Typography>
          {value.fromDetail && value.english && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{value.english}</Typography>}
        </Box>
        {value.meta && <Typography sx={{ fontSize: 14 }}>{value.meta}</Typography>}
        {!disabled && (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {value.fromDetail && (
              <ButtonBase onClick={() => onChange(null)} sx={buttonSx}>
                Alterar anime
              </ButtonBase>
            )}
            <ButtonBase onClick={() => onChange(null)} aria-label="Remover associação" sx={buttonSx}>
              Remover associação
            </ButtonBase>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography id={labelId} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
        Buscar e associar um anime
      </Typography>
      <Autocomplete<RelatedAnime>
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
        isOptionEqualToValue={(a, b) => a.work === b.work}
        noOptionsText={input.trim().length < 2 ? "Digite ao menos 2 letras" : "Nenhum anime encontrado"}
        popupIcon={null}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Kanji, kana, romaji ou título em inglês"
            sx={{
              "& .MuiOutlinedInput-root": {
                bgcolor: "background.paper",
                borderRadius: "10px",
                p: "16px !important",
                fontSize: 14,
                "& fieldset": { borderColor: "divider" },
                "&:hover fieldset": { borderColor: "text.secondary" },
              },
              "& .MuiAutocomplete-input": { p: "0 !important" },
            }}
            slotProps={{
              ...params.slotProps,
              htmlInput: { ...params.slotProps.htmlInput, "aria-labelledby": labelId },
              input: {
                ...params.slotProps.input,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={16} /> : <SearchIcon sx={{ fontSize: 18 }} />}
                    {params.slotProps.input.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    </Box>
  );
}
