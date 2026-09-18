"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchIcon from "@mui/icons-material/Search";
import TheaterComedyIcon from "@mui/icons-material/TheaterComedy";
import EventIcon from "@mui/icons-material/Event";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  InputAdornment,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
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

function DiscoverPageContent() {
  // Link "por gênero" que sai da página de detalhe do anime (achado real da
  // 6ª rodada de auditoria, Epic 18) — chips de gênero lá eram só texto
  // estático, sem levar a lugar nenhum. Servidor e cliente enxergam a mesma
  // URL, então dá pra ler direto no inicializador do state (diferente do
  // localStorage de filtersExpanded logo abaixo, que só existe no cliente).
  const searchParams = useSearchParams();
  // `?search=` — mesmo padrão de `?genre=` acima, usado pela lateral de
  // threads de anime do Feed (Epic 25) pra linkar direto pra uma busca já
  // preenchida, já que nem todo anilistId tem uma linha de Anime que o
  // viewer atual possa abrir (posse é por usuário).
  const [query, setQuery] = useState(() => searchParams.get("search") ?? "");
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
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(() => searchParams.get("genre"));
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("popular");

  const genreRowRef = useRef<HTMLDivElement>(null);
  const seasonRowRef = useRef<HTMLDivElement>(null);
  const yearRowRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<React.RefObject<HTMLDivElement | null> | null>(null);
  const expandingRef = useRef(false);

  const [filtersExpanded, setFiltersExpanded] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("discover-filters-expanded") === "1") {
        // Só dá pra ler localStorage depois de montar — inicializar o
        // estado direto no useState causaria mismatch de hidratação real
        // (SSR nunca vê localStorage, então sempre renderiza recolhido;
        // hidratar aqui, não no inicializador, é o padrão já usado em
        // titlePreference.tsx). O lint react-hooks/set-state-in-effect
        // não modela essa exceção de hidratação — falso positivo aqui.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFiltersExpanded(true);
      }
    } catch {
      // localStorage indisponível (modo privado, etc.) — fica colapsado.
    }
  }, []);

  function updateFiltersExpanded(next: boolean) {
    setFiltersExpanded(next);
    try {
      localStorage.setItem("discover-filters-expanded", next ? "1" : "0");
    } catch {
      // idem — falha silenciosa, é só a conveniência de lembrar a preferência.
    }
  }

  function handleFiltersToggle(next: boolean) {
    pendingScrollRef.current = null;
    updateFiltersExpanded(next);
  }

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
      .catch(() => setCatalogAll([]))
      .finally(() => setLoadingCatalog(false));

    fetch("/api/catalog/ranking")
      .then((res) => res.json())
      .then((data) => setRanking(data.results ?? []))
      .catch(() => setRanking([]));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      // Zera resultado/erro da busca anterior — sem isso, a próxima vez que
      // a query voltar a ter 2+ caracteres mostraria por um instante (até o
      // debounce de 400ms abaixo resolver) um erro ou resultado desatualizado
      // de uma busca antiga sem relação com o texto atual.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Sempre as 4 estações fixas — não depende do que já está em cache, senão
  // uma estação sem nenhum item buscado ainda (ex.: inverno logo após o
  // catálogo ser limpo) some do filtro em vez de aparecer com resultado vazio.
  const seasons = ["WINTER", "SPRING", "SUMMER", "FALL"];

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

  // A busca ao vivo na AniList (searchResults) só manda `q` pra API — os
  // chips de gênero/status/temporada/ano continuam visíveis acima dela
  // como se estivessem em vigor pras 2 fileiras, mas só filteredCatalog
  // de fato os aplicava. Filtra aqui do mesmo jeito, client-side, com os
  // mesmos campos já presentes em todo DiscoverItem (achado real da 21ª
  // rodada de auditoria, Epic 18: com "COMEDY" selecionado, a fileira do
  // catálogo mostrava só comédias, mas a fileira de busca da AniList
  // misturava títulos de qualquer gênero que só batessem o texto).
  const filteredSearchResults = useMemo(() => {
    const filtered = searchResults.filter((item) => {
      if (selectedGenre && !item.genres.includes(selectedGenre)) return false;
      if (selectedStatus && item.status !== selectedStatus) return false;
      if (selectedSeason && item.season !== selectedSeason) return false;
      if (selectedYear && yearOf(item) !== selectedYear) return false;
      return true;
    });
    return sortItems(filtered, sortBy);
  }, [searchResults, selectedGenre, selectedStatus, selectedSeason, selectedYear, sortBy]);

  function clearFilters() {
    setQuery("");
    setSelectedGenre(null);
    setSelectedStatus(null);
    setSelectedSeason(null);
    setSelectedYear(null);
  }

  function scrollToRow(ref: React.RefObject<HTMLDivElement | null>, requiresExpand = false) {
    // Enquanto a transição de expandir ainda está em andamento (ex.: clicar
    // em "Por temporada" e, antes dela terminar, clicar em "Por ano"), a
    // linha-alvo ainda não está no layout final — atualiza o alvo pendente
    // e deixa o onEntered da transição já em curso resolver o scroll,
    // em vez de rolar pra uma posição intermediária que vai ficar errada
    // assim que o layout terminar de crescer.
    if (requiresExpand && (!filtersExpanded || expandingRef.current)) {
      pendingScrollRef.current = ref;
      if (!filtersExpanded) {
        expandingRef.current = true;
        updateFiltersExpanded(true);
      }
      return;
    }
    pendingScrollRef.current = null;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleExtraFiltersEntered() {
    expandingRef.current = false;
    pendingScrollRef.current?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    pendingScrollRef.current = null;
  }

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          px: { xs: 3, sm: 5 },
          py: 5,
          background: "linear-gradient(to bottom, rgba(228,0,43,0.1), transparent)",
        }}
      >
        <Typography variant="h3" component="h1" className="font-display" sx={{ textTransform: "uppercase" }}>
          Descobrir
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, mb: 3, color: "text.secondary" }}>
          Busque, filtre e encontre o próximo anime pra sua lista.
        </Typography>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar anime..."
          size="small"
          fullWidth
          sx={{ maxWidth: 480 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      {/* Cards de navegação rápida, inspirados no "番剧索引 / 类型风格 / 首播时间"
          do Bilibili — atalhos visuais pras categorias mais usadas. */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5, px: { xs: 3, sm: 5 }, py: 3 }}>
        <Card variant="outlined" sx={{ bgcolor: "rgba(228,0,43,0.08)", transition: "transform 0.15s ease", "&:hover": { transform: "scale(1.015)" } }}>
          <CardActionArea onClick={() => scrollToRow(genreRowRef)} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
            <Box>
              <Typography className="font-display" sx={{ textTransform: "uppercase" }}>
                Por gênero
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {loadingCatalog ? "Carregando..." : `${genres.length} categorias`}
              </Typography>
            </Box>
            <TheaterComedyIcon sx={{ fontSize: 28, color: "primary.main" }} />
          </CardActionArea>
        </Card>
        <Card variant="outlined" sx={{ bgcolor: "rgba(46,111,242,0.08)", transition: "transform 0.15s ease", "&:hover": { transform: "scale(1.015)" } }}>
          <CardActionArea onClick={() => scrollToRow(seasonRowRef, true)} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
            <Box>
              <Typography className="font-display" sx={{ textTransform: "uppercase" }}>
                Por temporada
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Inverno · Primavera · Verão · Outono
              </Typography>
            </Box>
            <EventIcon sx={{ fontSize: 28, color: "#2e6ff2" }} />
          </CardActionArea>
        </Card>
        <Card variant="outlined" sx={{ bgcolor: "rgba(255,212,0,0.08)", transition: "transform 0.15s ease", "&:hover": { transform: "scale(1.015)" } }}>
          <CardActionArea onClick={() => scrollToRow(yearRowRef, true)} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2 }}>
            <Box>
              <Typography className="font-display" sx={{ textTransform: "uppercase" }}>
                Por ano
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {years[years.length - 1] ?? "—"}–{years[0] ?? "—"}
              </Typography>
            </Box>
            <CalendarMonthIcon sx={{ fontSize: 28, color: "secondary.main" }} />
          </CardActionArea>
        </Card>
      </Box>

      {ranking.length > 0 && (
        <Row title="🔥 Em alta">
          {ranking.map((item, i) => (
            <DiscoverCard key={item.key} item={item} rank={i + 1} />
          ))}
        </Row>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, px: { xs: 3, sm: 5 }, py: 3 }}>
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
          expanded={filtersExpanded}
          onExpandedChange={handleFiltersToggle}
          onExtraFiltersEntered={handleExtraFiltersEntered}
        />

        {filtersActive && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
            {query.trim().length >= 2 && <Chip size="small" label={`"${query.trim()}"`} />}
            {selectedGenre && <Chip size="small" label={selectedGenre} sx={{ textTransform: "uppercase" }} />}
            {selectedStatus && (
              <Chip size="small" label={CATALOG_STATUS_LABELS[selectedStatus] ?? selectedStatus} sx={{ textTransform: "uppercase" }} />
            )}
            {selectedSeason && (
              <Chip size="small" label={SEASON_LABELS[selectedSeason] ?? selectedSeason} sx={{ textTransform: "uppercase" }} />
            )}
            {selectedYear && <Chip size="small" label={String(selectedYear)} />}
            <Button onClick={clearFilters} size="small" color="error">
              Limpar filtros
            </Button>
          </Stack>
        )}
      </Box>

      {query.trim().length >= 2 && (
        <Box component="section" sx={{ mb: 1 }}>
          {searchError ? (
            <Box sx={{ px: { xs: 3, sm: 5 } }}>
              <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1, textTransform: "uppercase" }}>
                Resultados da busca
              </Typography>
              <Alert severity="error">{searchError}</Alert>
            </Box>
          ) : (
            <>
              {searchCached && !searching && (
                <Box sx={{ px: { xs: 3, sm: 5 }, pb: 1 }}>
                  <Alert severity="info" variant="outlined">
                    AniList fora do ar — mostrando resultados salvos localmente.
                  </Alert>
                </Box>
              )}
              <Row title={searching ? "Buscando..." : "Resultados da busca (AniList)"}>
                {filteredSearchResults.map((item) => (
                  <DiscoverCard key={item.key} item={item} />
                ))}
              </Row>
            </>
          )}
        </Box>
      )}

      <Box component="section">
        {filtersActive ? (
          loadingCatalog ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: { xs: 1.5, sm: 2 },
                px: { xs: 3, sm: 5 },
                pb: 3,
                pt: 2,
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "2 / 3", width: "100%", borderRadius: 1 }} />
              ))}
            </Box>
          ) : filteredCatalog.length > 0 ? (
            <>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: { xs: 3, sm: 5 } }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 6, height: 16, bgcolor: "primary.main", transform: "skewX(-12deg)" }} />
                  <Typography variant="h6" component="h2" sx={{ textTransform: "uppercase" }}>
                    {filteredCatalog.length} resultado
                    {filteredCatalog.length === 1 ? "" : "s"}
                  </Typography>
                </Box>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  size="small"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <MenuItem key={key} value={key}>
                      Ordenar: {SORT_LABELS[key]}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: { xs: 1.5, sm: 2 },
                  px: { xs: 3, sm: 5 },
                  pb: 3,
                  pt: 2,
                }}
              >
                {filteredCatalog.map((item) => (
                  <DiscoverCard key={item.key} item={item} fill />
                ))}
              </Box>
            </>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
              <Typography variant="h4" className="font-display" sx={{ textTransform: "uppercase" }}>
                Página em branco!!
              </Typography>
              <Typography variant="body2" sx={{ maxWidth: 384, color: "text.secondary" }}>
                Nenhum anime bate com esses filtros. Tenta remover um deles ou
                escolher outro ano/gênero.
              </Typography>
              <Button onClick={clearFilters} variant="contained" sx={{ mt: 1 }}>
                Limpar filtros
              </Button>
            </Box>
          )
        ) : seasonError ? (
          <Box sx={{ px: { xs: 3, sm: 5 } }}>
            <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1, textTransform: "uppercase" }}>
              Lançamentos da temporada
            </Typography>
            <Alert severity="error">
              {seasonError}. A API pública da AniList pode estar instável —
              tente novamente em alguns minutos.
            </Alert>
          </Box>
        ) : (
          <>
            {seasonCached && !loadingSeason && (
              <Box sx={{ px: { xs: 3, sm: 5 }, pb: 1 }}>
                <Alert severity="info" variant="outlined">
                  {sourcesDisabled
                    ? "Modo AniDB-only ativo — outras fontes desativadas, mostrando o catálogo salvo localmente."
                    : "AniList fora do ar — mostrando o catálogo salvo localmente."}
                </Alert>
              </Box>
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
      </Box>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverPageContent />
    </Suspense>
  );
}
