import { Badge, Box, Button, Collapse, MenuItem, Select, Typography, type SelectChangeEvent } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { CATALOG_STATUS_LABELS, SEASON_LABELS } from "@/lib/types";
import { FilterChipRow } from "@/components/FilterChipRow";

export function DiscoverFilters({
  genres,
  statuses,
  seasons,
  years,
  selectedGenre,
  selectedStatus,
  selectedSeason,
  selectedYear,
  onGenreChange,
  onStatusChange,
  onSeasonChange,
  onYearChange,
  genreRowRef,
  seasonRowRef,
  yearRowRef,
  expanded,
  onExpandedChange,
  onExtraFiltersEntered,
}: {
  genres: string[];
  statuses: string[];
  seasons: string[];
  years: number[];
  selectedGenre: string | null;
  selectedStatus: string | null;
  selectedSeason: string | null;
  selectedYear: number | null;
  onGenreChange: (genre: string | null) => void;
  onStatusChange: (status: string | null) => void;
  onSeasonChange: (season: string | null) => void;
  onYearChange: (year: number | null) => void;
  genreRowRef?: React.RefObject<HTMLDivElement | null>;
  seasonRowRef?: React.RefObject<HTMLDivElement | null>;
  yearRowRef?: React.RefObject<HTMLDivElement | null>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onExtraFiltersEntered?: () => void;
}) {
  function handleYearChange(e: SelectChangeEvent<number | "">) {
    const value = e.target.value;
    onYearChange(value === "" ? null : Number(value));
  }

  const hiddenActiveCount = (selectedSeason ? 1 : 0) + (selectedYear ? 1 : 0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, border: 1, borderColor: "divider", bgcolor: "background.paper", p: 2 }}>
      <Box ref={genreRowRef}>
        <FilterChipRow
          label="Gênero"
          options={genres.map((g) => ({ value: g, label: g }))}
          selected={selectedGenre}
          onChange={onGenreChange}
        />
      </Box>

      <FilterChipRow
        label="Status"
        options={statuses.map((s) => ({
          value: s,
          label: CATALOG_STATUS_LABELS[s] ?? s,
        }))}
        selected={selectedStatus}
        onChange={onStatusChange}
      />

      <Collapse in={expanded} timeout="auto" onEntered={onExtraFiltersEntered}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box ref={seasonRowRef}>
            <FilterChipRow
              label="Temporada"
              options={seasons.map((s) => ({
                value: s,
                label: SEASON_LABELS[s] ?? s,
              }))}
              selected={selectedSeason}
              onChange={onSeasonChange}
            />
          </Box>

          <Box
            ref={yearRowRef}
            sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: { xs: 0.75, sm: 2 }, alignItems: { sm: "center" } }}
          >
            <Typography variant="overline" sx={{ width: 96, flexShrink: 0, color: "text.secondary" }}>
              Ano
            </Typography>
            <Select
              value={selectedYear ?? ""}
              onChange={handleYearChange}
              displayEmpty
              size="small"
              sx={{ width: "fit-content", minWidth: 160 }}
            >
              <MenuItem value="">Todos os anos</MenuItem>
              {years.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Box>
      </Collapse>

      <Button
        onClick={() => onExpandedChange(!expanded)}
        size="small"
        aria-expanded={expanded}
        startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{ alignSelf: "flex-start", color: "text.secondary" }}
      >
        {expanded ? (
          "Menos filtros"
        ) : (
          <Badge badgeContent={hiddenActiveCount} color="primary" sx={{ "& .MuiBadge-badge": { right: -10 } }}>
            Mais filtros
          </Badge>
        )}
      </Button>
    </Box>
  );
}
