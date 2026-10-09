"use client";

import { useMemo, useState } from "react";
import { Box, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { AnimeCard } from "@/components/AnimeCard";
import { Row } from "@/components/Row";
import { groupByRelease } from "@/lib/myListGroups";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { useTimeZone } from "@/lib/useTimeZone";

export type MyListEntry = {
  id: string;
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  titlePortuguese: string | null;
  coverImage: string | null;
  isFavorite: boolean;
  createdAt: string;
  nextAiringAt: string | null;
  nextEpisode: number | null;
};

type SortMode = "next" | "recent" | "title";

/**
 * Minha Lista (Figma `8:2608`): agrupada por data do próximo lançamento,
 * com busca e ordenação. Privada e sem qualquer métrica de consumo.
 */
export function MyListView({ entries }: { entries: MyListEntry[] }) {
  const { preference } = useTitlePreference();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("next");
  const timeZone = useTimeZone();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) =>
      [e.titleRomaji, e.titleEnglish, e.titleNative, e.titlePortuguese]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [entries, query]);


  const groups = useMemo(() => {
    if (sort === "next") return groupByRelease(visible, new Date(), timeZone);
    const sorted = [...visible].sort((a, b) =>
      sort === "recent"
        ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
        : resolveTitleText(preference, a).localeCompare(resolveTitleText(preference, b), "pt-BR")
    );
    return [{ key: "all", label: sort === "recent" ? "Adicionados recentemente" : "Em ordem alfabética", items: sorted }];
  }, [visible, sort, timeZone, preference]);

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ px: { xs: 3, sm: 5 }, py: 2, alignItems: { sm: "center" } }}>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar na minha lista…"
          size="small"
          slotProps={{ htmlInput: { "aria-label": "Buscar na minha lista" } }}
          sx={{ minWidth: 260 }}
        />
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          size="small"
          aria-label="Ordenar"
          data-testid="sort-select"
        >
          <MenuItem value="next">Próximo lançamento</MenuItem>
          <MenuItem value="recent">Adicionados recentemente</MenuItem>
          <MenuItem value="title">Título</MenuItem>
        </Select>
      </Stack>

      {visible.length === 0 ? (
        <Typography sx={{ px: { xs: 3, sm: 5 }, color: "text.secondary" }}>
          Nenhum anime da sua lista bate com essa busca.
        </Typography>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div key={group.key} data-testid={`group-${group.key}`}>
            <Row title={group.label}>
              {group.items.map((e) => (
                <AnimeCard
                  key={e.id}
                  id={e.id}
                  href={`/anime/${e.id}`}
                  titles={{
                    titleRomaji: e.titleRomaji,
                    titleEnglish: e.titleEnglish,
                    titleNative: e.titleNative,
                    titlePortuguese: e.titlePortuguese,
                  }}
                  coverImage={e.coverImage}
                  isFavorite={e.isFavorite}
                  next={e.nextAiringAt && e.nextEpisode ? { airingAt: e.nextAiringAt, episode: e.nextEpisode } : null}
                />
              ))}
            </Row>
            </div>
          ))}
        </div>
      )}
    </Box>
  );
}
