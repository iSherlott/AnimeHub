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
}) {
  return (
    <div className="flex flex-col gap-3 border border-border bg-surface p-4">
      <div ref={genreRowRef}>
        <FilterChipRow
          label="Gênero"
          options={genres.map((g) => ({ value: g, label: g }))}
          selected={selectedGenre}
          onChange={onGenreChange}
        />
      </div>

      <FilterChipRow
        label="Status"
        options={statuses.map((s) => ({
          value: s,
          label: CATALOG_STATUS_LABELS[s] ?? s,
        }))}
        selected={selectedStatus}
        onChange={onStatusChange}
      />

      <div ref={seasonRowRef}>
        <FilterChipRow
          label="Temporada"
          options={seasons.map((s) => ({
            value: s,
            label: SEASON_LABELS[s] ?? s,
          }))}
          selected={selectedSeason}
          onChange={onSeasonChange}
        />
      </div>

      <div
        ref={yearRowRef}
        className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="font-display w-24 flex-shrink-0 text-xs uppercase tracking-wide text-text-muted">
          Ano
        </span>
        <select
          value={selectedYear ?? ""}
          onChange={(e) => onYearChange(e.target.value ? Number(e.target.value) : null)}
          className="w-fit border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Todos os anos</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
