"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { Row } from "@/components/Row";
import { DiscoverCard } from "@/components/DiscoverCard";
import { DiscoverFilters } from "@/components/DiscoverFilters";
import type { DiscoverItem } from "@/lib/discoverItem";
import { CATALOG_STATUS_LABELS, SEASON_LABELS } from "@/lib/types";

type SortKey = "popular" | "recent" | "title" | "year" | "episodes";

const SORT_LABELS: Record<SortKey, string> = {
  popular: "Populares",
  recent: "Recentes",
  title: "Título A-Z",
  year: "Ano",
  episodes: "Episódios",
};

function yearOf(item: DiscoverItem): number | null {
  return item.startDate ? new Date(item.startDate).getFullYear() : null;
}

function sortItems(items: DiscoverItem[], sortBy: SortKey): DiscoverItem[] {
  const arr = [...items];
  switch (sortBy) {
    case "title":
      return arr.sort((a, b) => a.titleRomaji.localeCompare(b.titleRomaji));
    case "year":
      return arr.sort((a, b) => (yearOf(b) ?? 0) - (yearOf(a) ?? 0));
    case "episodes":
      return arr.sort((a, b) => (b.episodes ?? 0) - (a.episodes ?? 0));
    case "recent":
      return arr; // já vem ordenado por atualização mais recente da API
    case "popular":
    default:
      return arr.sort(
        (a, b) => (a.popularityRank ?? 9999) - (b.popularityRank ?? 9999)
      );
  }
}

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DiscoverItem[]>([]);
  const [searchCached, setSearchCached] = useState(false);
  const [seasonResults, setSeasonResults] = useState<DiscoverItem[]>([]);
  const [seasonCached, setSeasonCached] = useState(false);
  const [sourcesDisabled, setSourcesDisabled] = useState(false);
  const [seasonLabel, setSeasonLabel] = useState("");
  const [seasonError, setSeasonError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingSeason, setLoadingSeason] = useState(true);

  const [ranking, setRanking] = useState<DiscoverItem[]>([]);

  const [catalogAll, setCatalogAll] = useState<DiscoverItem[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("popular");

  const genreRowRef = useRef<HTMLDivElement>(null);
  const seasonRowRef = useRef<HTMLDivElement>(null);
  const yearRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/anilist/season")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setSeasonError(data.error ?? "Falha ao carregar lançamentos");
          return;
        }
        setSeasonResults(data.results ?? []);
        setSeasonCached(Boolean(data.cached));
        setSourcesDisabled(Boolean(data.disabled));
        setSeasonLabel(`${data.season} ${data.seasonYear}`);
      })
      .catch(() => setSeasonError("Falha ao carregar lançamentos"))
      .finally(() => setLoadingSeason(false));

    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data) => setCatalogAll(data.results ?? []))
      .catch(() => setCatalogAll([]));

    fetch("/api/catalog/ranking")
      .then((res) => res.json())
      .then((data) => setRanking(data.results ?? []))
      .catch(() => setRanking([]));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    const timeout = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      fetch(`/api/anilist/search?q=${encodeURIComponent(query)}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            setSearchError(data.error ?? "Falha na busca");
            return;
          }
          setSearchResults(data.results ?? []);
          setSearchCached(Boolean(data.cached));
        })
        .catch(() => setSearchError("Falha na busca"))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timeout);
  }, [query]);

  const genres = useMemo(() => {
    // A Kitsu tem uma taxonomia de categorias bem mais granular que a
    // AniList (dezenas de tags de nicho). Pra manter a fileira de filtros
    // enxuta, só mostramos gêneros compartilhados por 2+ animes do catálogo.
    const counts = new Map<string, number>();
    for (const item of catalogAll) {
      for (const g of item.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([genre]) => genre);
  }, [catalogAll]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogAll) if (item.status) set.add(item.status);
    return Array.from(set);
  }, [catalogAll]);

  const seasons = useMemo(() => {
    const order = ["WINTER", "SPRING", "SUMMER", "FALL"];
    const set = new Set<string>();
    for (const item of catalogAll) if (item.season) set.add(item.season);
    return order.filter((s) => set.has(s));
  }, [catalogAll]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const item of catalogAll) {
      const y = yearOf(item);
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [catalogAll]);

  const filtersActive =
    query.trim().length >= 2 ||
    selectedGenre !== null ||
    selectedStatus !== null ||
    selectedSeason !== null ||
    selectedYear !== null;

  const filteredCatalog = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = catalogAll.filter((item) => {
      if (needle) {
        const matches = [item.titleRomaji, item.titleEnglish, item.titleNative]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(needle));
        if (!matches) return false;
      }
      if (selectedGenre && !item.genres.includes(selectedGenre)) return false;
      if (selectedStatus && item.status !== selectedStatus) return false;
      if (selectedSeason && item.season !== selectedSeason) return false;
      if (selectedYear && yearOf(item) !== selectedYear) return false;
      return true;
    });
    return sortItems(filtered, sortBy);
  }, [catalogAll, query, selectedGenre, selectedStatus, selectedSeason, selectedYear, sortBy]);

  function clearFilters() {
    setQuery("");
    setSelectedGenre(null);
    setSelectedStatus(null);
    setSelectedSeason(null);
    setSelectedYear(null);
  }

  function scrollToRow(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <div className="jump-halftone border-b border-border px-6 py-8 sm:px-10">
        <h1 className="font-display text-3xl uppercase tracking-wide text-text-primary drop-shadow-[3px_3px_0_#000] sm:text-4xl">
          Descobrir
        </h1>
      </div>

      {/* Cards de navegação rápida, inspirados no "番剧索引 / 类型风格 / 首播时间"
          do Bilibili — atalhos visuais pras categorias mais usadas. */}
      <div className="grid grid-cols-1 gap-3 px-6 py-6 sm:grid-cols-3 sm:px-10">
        <button
          onClick={() => scrollToRow(genreRowRef)}
          className="flex items-center justify-between border border-border bg-jump-red/10 p-4 text-left transition hover:border-jump-red"
        >
          <div>
            <p className="font-display uppercase tracking-wide text-text-primary">
              Por gênero
            </p>
            <p className="text-xs text-text-muted">{genres.length} categorias</p>
          </div>
          <span className="text-2xl">🎭</span>
        </button>
        <button
          onClick={() => scrollToRow(seasonRowRef)}
          className="flex items-center justify-between border border-border bg-status-watching/10 p-4 text-left transition hover:border-status-watching"
        >
          <div>
            <p className="font-display uppercase tracking-wide text-text-primary">
              Por temporada
            </p>
            <p className="text-xs text-text-muted">Inverno · Primavera · Verão · Outono</p>
          </div>
          <span className="text-2xl">🗓️</span>
        </button>
        <button
          onClick={() => scrollToRow(yearRowRef)}
          className="flex items-center justify-between border border-border bg-jump-yellow/10 p-4 text-left transition hover:border-jump-yellow"
        >
          <div>
            <p className="font-display uppercase tracking-wide text-text-primary">
              Por ano
            </p>
            <p className="text-xs text-text-muted">
              {years[years.length - 1] ?? "—"}–{years[0] ?? "—"}
            </p>
          </div>
          <span className="text-2xl">📅</span>
        </button>
      </div>

      {ranking.length > 0 && (
        <Row title="🔥 Em alta">
          {ranking.map((item, i) => (
            <DiscoverCard key={item.key} item={item} rank={i + 1} />
          ))}
        </Row>
      )}

      <div className="flex flex-col gap-4 px-6 py-6 sm:px-10">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar anime..."
          className="w-full max-w-md border border-border bg-surface px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-jump-red focus:outline-none"
        />

        <DiscoverFilters
          genres={genres}
          statuses={statuses}
          seasons={seasons}
          years={years}
          selectedGenre={selectedGenre}
          selectedStatus={selectedStatus}
          selectedSeason={selectedSeason}
          selectedYear={selectedYear}
          onGenreChange={setSelectedGenre}
          onStatusChange={setSelectedStatus}
          onSeasonChange={setSelectedSeason}
          onYearChange={setSelectedYear}
          genreRowRef={genreRowRef}
          seasonRowRef={seasonRowRef}
          yearRowRef={yearRowRef}
        />

        {filtersActive && (
          <div className="flex flex-wrap items-center gap-2">
            {query.trim().length >= 2 && (
              <span className="jump-badge bg-surface-raised px-2.5 py-1 text-xs text-text-body">
                &ldquo;{query.trim()}&rdquo;
              </span>
            )}
            {selectedGenre && (
              <span className="jump-badge bg-surface-raised px-2.5 py-1 text-xs uppercase text-text-body">
                {selectedGenre}
              </span>
            )}
            {selectedStatus && (
              <span className="jump-badge bg-surface-raised px-2.5 py-1 text-xs uppercase text-text-body">
                {CATALOG_STATUS_LABELS[selectedStatus] ?? selectedStatus}
              </span>
            )}
            {selectedSeason && (
              <span className="jump-badge bg-surface-raised px-2.5 py-1 text-xs uppercase text-text-body">
                {SEASON_LABELS[selectedSeason] ?? selectedSeason}
              </span>
            )}
            {selectedYear && (
              <span className="jump-badge bg-surface-raised px-2.5 py-1 text-xs text-text-body">
                {selectedYear}
              </span>
            )}
            <button
              onClick={clearFilters}
              className="font-display text-xs uppercase tracking-wide text-jump-red hover:text-jump-red-bright"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {query.trim().length >= 2 && (
        <section className="mb-2">
          {searchError ? (
            <div className="px-6 sm:px-10">
              <h2 className="font-display mb-2 text-lg uppercase tracking-wide text-text-primary">
                Resultados da busca
              </h2>
              <p className="text-sm text-jump-red-bright">{searchError}</p>
            </div>
          ) : (
            <>
              {searchCached && !searching && (
                <p className="px-6 pb-2 text-xs text-cache sm:px-10">
                  AniList fora do ar — mostrando resultados salvos localmente.
                </p>
              )}
              <Row title={searching ? "Buscando..." : "Resultados da busca (AniList)"}>
                {searchResults.map((item) => (
                  <DiscoverCard key={item.key} item={item} />
                ))}
              </Row>
            </>
          )}
        </section>
      )}

      <section>
        {filtersActive ? (
          filteredCatalog.length > 0 ? (
            <>
              <div className="flex items-center justify-between px-6 sm:px-10">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1.5 -skew-x-12 bg-jump-red" />
                  <h2 className="font-display text-lg uppercase tracking-wide text-text-primary">
                    {filteredCatalog.length} resultado
                    {filteredCatalog.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <option key={key} value={key}>
                      Ordenar: {SORT_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-6 pb-6 pt-4 sm:gap-3 sm:px-10">
                {filteredCatalog.map((item) => (
                  <DiscoverCard key={item.key} item={item} />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <p className="font-display -rotate-3 text-3xl uppercase text-text-primary drop-shadow-[3px_3px_0_#e4002b]">
                Página em branco!!
              </p>
              <p className="max-w-sm text-sm text-text-body">
                Nenhum anime bate com esses filtros. Tenta remover um deles ou
                escolher outro ano/gênero.
              </p>
              <button
                onClick={clearFilters}
                className="jump-shadow border-2 border-border-strong bg-jump-red px-5 py-2 font-display text-sm uppercase tracking-wide text-text-primary transition hover:bg-jump-red-bright"
              >
                Limpar filtros
              </button>
            </div>
          )
        ) : seasonError ? (
          <div className="px-6 sm:px-10">
            <h2 className="font-display mb-2 text-lg uppercase tracking-wide text-text-primary">
              Lançamentos da temporada
            </h2>
            <p className="text-sm text-jump-red-bright">
              {seasonError}. A API pública da AniList pode estar instável —
              tente novamente em alguns minutos.
            </p>
          </div>
        ) : (
          <>
            {seasonCached && !loadingSeason && (
              <p className="px-6 pb-2 text-xs text-cache sm:px-10">
                {sourcesDisabled
                  ? "Modo AniDB-only ativo — outras fontes desativadas, mostrando o catálogo salvo localmente."
                  : "AniList fora do ar — mostrando o catálogo salvo localmente."}
              </p>
            )}
            <Row
              title={
                loadingSeason ? "Carregando temporada..." : `Lançamentos — ${seasonLabel}`
              }
            >
              {seasonResults.map((item) => (
                <DiscoverCard key={item.key} item={item} />
              ))}
            </Row>
          </>
        )}
      </section>
    </div>
  );
}
