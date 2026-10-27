"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import CloseIcon from "@mui/icons-material/Close";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import { Alert, Badge, Box, Button, Dialog, IconButton, TextField, Typography } from "@mui/material";
import LiveTvOutlinedIcon from "@mui/icons-material/LiveTvOutlined";
import { ErrorNotice } from "@/components/StatePanels";
import { ScrollCarousel } from "@/components/ScrollCarousel";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ELEVATED_BUTTON_SX, ExploreCard, useScheduleText, useTitleLines } from "@/components/ExploreCard";
import { CardGrid, CardGridSkeleton, EmptyPanel, SectionHeader, SeasonChips } from "@/components/ExploreParts";
import { SearchField, SelectField } from "@/components/FilterField";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { usePagedList } from "@/lib/usePagedList";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { DiscoverItem } from "@/lib/discoverItem";
import { currentSeasonRef, scheduleOf, seasonLabel, seasonSlug } from "@/lib/exploreGroups";
import { readRecentWorks } from "@/lib/recentWorks";
import { loginHref } from "@/lib/safeRedirect";
import { CATALOG_STATUS_LABELS, SEASON_LABELS } from "@/lib/types";
import { KINDS, KIND_LABELS, type Kind } from "@/lib/curation/kind";
import { useTimeZone } from "@/lib/useTimeZone";
import { formatTimeInZone } from "@/lib/timeZone";

/** Mesma largura da coluna da grade (2/3/4 colunas, 24 px de respiro; o carrossel tem 8 px de folga de cada lado), para o cartão ter o mesmo tamanho nos dois lugares. */
const CAROUSEL_CARD_WIDTH = { xs: "calc((100% + 16px - 24px) / 2)", md: "calc((100% + 16px - 48px) / 3)", lg: "calc((100% + 16px - 72px) / 4)" } as const;

type Facets = { total: number; genres: Array<{ name: string; count: number }>; statuses: string[]; seasons: string[]; years: number[]; kinds: string[] };

type SortKey = "popular" | "recent" | "title" | "year" | "episodes";

const SORT_LABELS: Record<SortKey, string> = {
  popular: "Populares",
  recent: "Recentes",
  title: "Título A-Z",
  year: "Ano",
  episodes: "Episódios",
};

/** "Mais filtros": palavras-chave, faixa de episódios e nota mínima (o servidor aplica; a busca ao vivo também respeita). */
const EMPTY_KEYWORDS = { titleHas: "", synopsisHas: "", exclude: "", epMin: "", epMax: "", minScore: "" };
type KeywordFilters = typeof EMPTY_KEYWORDS;

const wordsOf = (raw: string) => [...new Set(raw.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 2))];

function matchesKeywordFilters(item: DiscoverItem, f: KeywordFilters): boolean {
  const titles = [item.titleRomaji, item.titleEnglish, item.titleNative].filter(Boolean).join(" ").toLowerCase();
  const synopsis = (item.description ?? "").toLowerCase();
  if (wordsOf(f.titleHas).some((w) => !titles.includes(w))) return false;
  if (wordsOf(f.synopsisHas).some((w) => !synopsis.includes(w))) return false;
  if (wordsOf(f.exclude).some((w) => titles.includes(w) || synopsis.includes(w))) return false;
  if (f.epMin.trim() && (item.episodes === null || item.episodes < Number(f.epMin))) return false;
  if (f.epMax.trim() && (item.episodes === null || item.episodes > Number(f.epMax))) return false;
  // A nota do site não vem no resultado da busca ao vivo: o catálogo (servidor) é quem filtra por ela.
  return true;
}

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
      return arr.sort((a, b) => (a.popularityRank ?? 9999) - (b.popularityRank ?? 9999));
  }
}

/** "Seu próximo lançamento" (Figma `8:1606`): horário em destaque do primeiro resultado. */
function NextReleasePanel({ item }: { item: DiscoverItem }) {
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const schedule = useScheduleText(item);
  const info = scheduleOf(item);
  const detailHref = item.anilistId !== null ? `/anime/${item.anilistId}` : null;
  // "+ Acompanhar" daqui adiciona direto à lista, sem sair da página.
  const [followedId, setFollowedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const ownedId = item.inMyList && item.animeId ? item.animeId : followedId;
  const owned = Boolean(ownedId);

  async function follow() {
    if (item.anilistId === null) return;
    setFollowing(true);
    setFollowError(null);
    try {
      const res = await fetch("/api/anime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anilistId: item.anilistId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFollowError(data.error ?? "Não foi possível acompanhar. Tente novamente.");
        return;
      }
      if (data.anime?.id) setFollowedId(data.anime.id as string);
    } catch {
      setFollowError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setFollowing(false);
    }
  }
  const when = info.kind === "scheduled" ? new Date(info.at) : null;
  const dayLabel = when
    ? new Intl.DateTimeFormat("pt-BR", { timeZone, day: "numeric", month: "long", year: "numeric" }).format(when)
    : null;

  return (
    <Box component="section" aria-labelledby="next-release-title" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3, borderRadius: "16px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
      <Typography id="next-release-title" component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
        Seu próximo lançamento
      </Typography>
      <Typography suppressHydrationWarning component="p" sx={{ fontSize: { xs: 28, md: 40 }, lineHeight: 1.2 }}>
        {schedule.text}
      </Typography>
      {when && info.kind === "scheduled" && (
        <Typography suppressHydrationWarning sx={{ fontSize: 16 }}>
          {info.episode ? `Episódio ${String(info.episode).padStart(2, "0")} · ` : ""}
          {dayLabel} · {formatTimeInZone(when, timeZone)}
        </Typography>
      )}
      <Typography sx={{ fontSize: 16, color: "text.secondary" }}>
        Horários no seu fuso: <span suppressHydrationWarning>{timeZone}</span>. Nada é deslocado para um horário inventado.
      </Typography>
      <Box>
        {owned ? (
          <Button component={NextLink} href={`/anime/${ownedId}`} sx={ELEVATED_BUTTON_SX}>
            Acompanhando
          </Button>
        ) : user === null ? (
          <Button component={NextLink} href={loginHref(detailHref ?? "/discover")} variant="contained" startIcon={<PersonOutlineIcon />}>
            Entrar para acompanhar
          </Button>
        ) : detailHref ? (
          <Button onClick={() => void follow()} disabled={following} variant="contained" data-testid="next-release-follow">
            {following ? "Adicionando…" : "+ Acompanhar"}
          </Button>
        ) : null}
        {followError && (
          <Typography role="alert" sx={{ fontSize: 12, color: "primary.main", mt: 0.5 }}>
            {followError}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function TitlesPanel({ item }: { item: DiscoverItem }) {
  const { primary, secondary } = useTitleLines(item);
  const all = Array.from(new Set([item.titleNative, item.titleRomaji, item.titleEnglish, primary, ...secondary].filter((t): t is string => Boolean(t))));
  return (
    <Box component="section" aria-labelledby="titles-title" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3, borderRadius: "16px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
      <Typography id="titles-title" component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
        Busca que entende seus títulos
      </Typography>
      <Typography sx={{ fontSize: 16, color: "text.secondary" }}>
        Resultados por kanji, leitura em kana, romaji ou inglês. A preferência de formato não limita o que você pode pesquisar.
      </Typography>
      <Typography sx={{ fontSize: 16 }}>{all.join("  ")}</Typography>
    </Box>
  );
}

function DiscoverPageContent() {
  // `?genre=` (chips do detalhe) e `?search=` (lateral de conversas da
  // Comunidade) chegam preenchidos: servidor e cliente enxergam a mesma URL.
  const searchParams = useSearchParams();
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const [query, setQuery] = useState(() => searchParams.get("search") ?? "");
  const [searchResults, setSearchResults] = useState<DiscoverItem[]>([]);
  const [searchCached, setSearchCached] = useState(false);
  // Fileiras do Explorar: o que está no ar hoje e as sugestões de "Novas histórias, outros tempos".
  const [todayItems, setTodayItems] = useState<DiscoverItem[]>([]);
  const [storyItems, setStoryItems] = useState<DiscoverItem[]>([]);
  const [personalized, setPersonalized] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // O que existe no catálogo (gêneros, anos, tipos…) para montar os filtros; as obras vêm página a página, ver `pager`.
  const [facets, setFacets] = useState<Facets | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>(() => searchParams.get("genre") ?? "");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedSeason, setSelectedSeason] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("popular");
  const [availability, setAvailability] = useState<"" | "scheduled" | "unscheduled">("");
  const [moreOpen, setMoreOpen] = useState(false);
  // Rascunho do modal "Mais filtros": só vale ao Aplicar; Esc/Cancelar descarta.
  const [keywordFilters, setKeywordFilters] = useState(EMPTY_KEYWORDS);
  const [draft, setDraft] = useState({ status: "", availability: "" as "" | "scheduled" | "unscheduled", sort: "popular" as SortKey, ...EMPTY_KEYWORDS });

  useEffect(() => {
    // A cada nova tentativa volta ao estado "carregando" antes da busca terminar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingRows(true);
    setRowsError(null);
    const recent = readRecentWorks().join(",");
    fetch(`/api/explore?tz=${encodeURIComponent(timeZone)}&recent=${recent}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setRowsError(data.error ?? "Falha ao carregar o Explorar");
          return;
        }
        setTodayItems(data.today ?? []);
        setStoryItems(data.stories ?? []);
        setPersonalized(Boolean(data.personalized));
      })
      .catch(() => setRowsError("Falha ao carregar o Explorar"))
      .finally(() => setLoadingRows(false));
  }, [reloadKey, timeZone, user?.id]);

  useEffect(() => {
    fetch("/api/catalog/facets")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Facets | null) => setFacets(data))
      .catch(() => setFacets(null));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      // Zera resultado/erro da busca anterior — sem isso, a próxima vez que a
      // query voltar a ter 2+ caracteres mostraria por um instante um erro ou
      // resultado desatualizado de uma busca antiga.
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

  const currentYear = currentSeasonRef().year;

  // Só mostramos gêneros compartilhados por 2+ animes do catálogo (a API já entrega assim).
  const genres = useMemo(() => {
    const list = (facets?.genres ?? []).map((g) => g.name);
    if (selectedGenre && !list.includes(selectedGenre)) list.unshift(selectedGenre);
    return list;
  }, [facets, selectedGenre]);

  const statuses = facets?.statuses ?? [];

  // Temporadas que existem no catálogo (nada de opção vazia).
  const seasonsAvailable = useMemo(() => ["WINTER", "SPRING", "SUMMER", "FALL"].filter((s) => (facets?.seasons ?? []).includes(s) || s === selectedSeason), [facets, selectedSeason]);

  // Tipos que existem no catálogo, na ordem da linha da história (episódios, OVA, ODA, filme, outros); nada de opção vazia.
  const formats = useMemo(() => KINDS.filter((k) => (facets?.kinds ?? []).includes(k) || k === selectedFormat), [facets, selectedFormat]);

  const years = useMemo(() => {
    const set = new Set<number>(!facets || facets.years.length === 0 ? [currentYear] : facets.years);
    if (selectedYear) set.add(Number(selectedYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [facets, currentYear, selectedYear]);

  const searchActive = query.trim().length >= 2;
  const keywordCount = Object.values(keywordFilters).filter((v) => v.trim() !== "").length;
  const filtersActive = selectedGenre !== "" || selectedStatus !== "" || selectedSeason !== "" || selectedYear !== "" || selectedFormat !== "" || availability !== "" || keywordCount > 0;
  const moreCount = (selectedStatus ? 1 : 0) + (availability ? 1 : 0) + (sortBy !== "popular" ? 1 : 0) + keywordCount;
  const mode: "search" | "filter" | "browse" = searchActive ? "search" : filtersActive ? "filter" : "browse";

  // As obras do catálogo chegam do servidor, 48 por vez, conforme a pessoa desce a página (rolagem infinita).
  const catalogQuery = useMemo(() => {
    const params = new URLSearchParams();
    const values: Record<string, string> = { q: searchActive ? query.trim() : "", genre: selectedGenre, status: selectedStatus, season: selectedSeason, year: selectedYear, kind: selectedFormat, availability, sort: sortBy, ...keywordFilters };
    for (const [key, value] of Object.entries(values)) if (value.trim()) params.set(key, value.trim());
    return params.toString();
  }, [searchActive, query, selectedGenre, selectedStatus, selectedSeason, selectedYear, selectedFormat, availability, sortBy, keywordFilters]);
  const pager = usePagedList<DiscoverItem>({
    resetKey: catalogQuery,
    enabled: mode !== "browse",
    keyOf: (item) => item.key,
    fetchPage: async (cursor) => {
      const res = await fetch(`/api/catalog/page?${catalogQuery}${cursor ? `${catalogQuery ? "&" : ""}cursor=${cursor}` : ""}`);
      if (!res.ok) throw new Error("falha");
      const data = (await res.json()) as { items?: DiscoverItem[]; nextCursor?: string | null; total?: number };
      return { items: data.items ?? [], nextCursor: data.nextCursor ?? null, total: data.total };
    },
  });
  const { ref: sentinelRef, supported: infiniteSupported } = useInfiniteScroll(pager.loadMore, pager.hasMore && !pager.loading && !pager.failed, pager.items.length);

  function matchesFilters(item: DiscoverItem): boolean {
    if (selectedGenre && !item.genres.includes(selectedGenre)) return false;
    if (selectedStatus && item.status !== selectedStatus) return false;
    if (selectedSeason && item.season !== selectedSeason) return false;
    if (selectedYear && yearOf(item) !== Number(selectedYear)) return false;
    if (selectedFormat && item.kind !== selectedFormat) return false;
    if (availability === "scheduled" && !item.nextEpisodeAt) return false;
    if (availability === "unscheduled" && item.nextEpisodeAt) return false;
    if (!matchesKeywordFilters(item, keywordFilters)) return false;
    return true;
  }

  // A busca ao vivo (relevância) vem na frente; o resto do catálogo que casa com a busca chega página a página. Os filtros
  // valem para as duas (achado real da 21ª rodada de auditoria, Epic 18: com "COMEDY" selecionado a busca misturava gêneros).
  const searchList = useMemo(() => {
    const live = sortItems(searchResults.filter(matchesFilters), sortBy);
    if (!searchActive) return live;
    const seen = new Set(live.map((i) => i.key));
    return [...live, ...pager.items.filter((i) => !seen.has(i.key))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults, pager.items, searchActive, selectedGenre, selectedStatus, selectedSeason, selectedYear, selectedFormat, availability, sortBy, keywordFilters]);
  // Quantos animes a busca encontrou: o total do catálogo (a busca ao vivo é parte dele), ou a lista inteira se for maior.
  const searchCount = pager.total !== null ? Math.max(pager.total, searchList.length) : searchList.length;

  function clearFilters() {
    setQuery("");
    setSelectedGenre("");
    setSelectedStatus("");
    setSelectedSeason("");
    setSelectedYear("");
    setSelectedFormat("");
    setAvailability("");
    setSortBy("popular");
    setKeywordFilters(EMPTY_KEYWORDS);
  }

  const season = currentSeasonRef();
  const seasonName = seasonLabel(season);
  const heroArt = todayItems.find((i) => i.bannerImage)?.bannerImage ?? storyItems.find((i) => i.bannerImage)?.bannerImage ?? todayItems[0]?.coverImage ?? null;

  const todayLabel = (() => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(now).replace(".", "").replace(/^./, (c) => c.toUpperCase());
    const rest = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(now).replace(/\./g, "").replace(/ de /g, " ");
    return `Horários locais · ${weekday} ${rest}`;
  })();

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        {mode === "search" ? (
          <PageIntro kicker="検索 / BUSCA" title="Resultado da busca" subtitle="Encontre a história que você quer acompanhar." />
        ) : (
          <PageIntro kicker="発見 / DESCOBERTA" title="EXPLORAR" subtitle="Descubra novos animes e encontre o que você procura." />
        )}

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
          <SearchField label="Encontre um anime" value={query} onChange={setQuery} placeholder="Buscar anime..." />
          <SelectField
            label="Gênero"
            value={selectedGenre}
            onChange={setSelectedGenre}
            options={[{ value: "", label: "Todos os gêneros" }, ...genres.map((g) => ({ value: g, label: g }))]}
          />
          <SelectField
            label="Temporada"
            value={selectedSeason}
            onChange={setSelectedSeason}
            options={[{ value: "", label: "Temporada" }, ...seasonsAvailable.map((s) => ({ value: s, label: SEASON_LABELS[s] ?? s }))]}
          />
          <SelectField
            label="Ano"
            value={selectedYear}
            onChange={setSelectedYear}
            width={136}
            options={[{ value: "", label: "Todos" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
          />
          <SelectField
            label="Tipo"
            value={selectedFormat}
            onChange={setSelectedFormat}
            width={180}
            options={[{ value: "", label: "Todos os tipos" }, ...formats.map((k) => ({ value: k, label: KIND_LABELS[k as Kind] }))]}
          />
          <Badge badgeContent={moreCount} color="primary" overlap="rectangular">
            <Button
              onClick={() => {
                setDraft({ status: selectedStatus, availability, sort: sortBy, ...keywordFilters });
                setMoreOpen(true);
              }}
              startIcon={<TuneIcon />}
              aria-haspopup="dialog"
              sx={ELEVATED_BUTTON_SX}
            >
              Mais filtros
            </Button>
          </Badge>
        </Box>

        {mode === "browse" && (
          <>
            {/* Destaque editorial da temporada (Figma `8:1411`). */}
            <Box
              component="section"
              aria-label={`Temporada ${seasonName}`}
              sx={{ position: "relative", overflow: "hidden", borderRadius: "16px", bgcolor: "background.paper", minHeight: 248 }}
            >
              {heroArt && (
                <Box
                  aria-hidden
                  sx={{ position: "absolute", top: 0, right: 0, bottom: 0, width: { xs: "100%", md: "52%" }, backgroundImage: `url(${heroArt})`, backgroundSize: "cover", backgroundPosition: "center 25%" }}
                />
              )}
              <Box aria-hidden sx={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #101116 0%, #101116 45%, rgba(16,17,22,0.15) 100%)" }} />
              <Box sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, p: 4, maxWidth: 620 }}>
                <Box sx={{ px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#2c111b" }}>
                  <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "primary.main", whiteSpace: "nowrap" }}>
                    TEMPORADA / {seasonName}
                  </Typography>
                </Box>
                <Typography component="p" lang="ja" sx={{ fontSize: { xs: 24, md: 32 }, fontWeight: 700, lineHeight: 1.3 }}>
                  次の物語を、あなたの時間に。
                </Typography>
                <Typography sx={{ fontSize: 16, color: "text.secondary" }}>
                  A próxima história, no seu tempo. Descubra a temporada e escolha o que acompanhar.
                </Typography>
                <Button component={NextLink} href={`/temporada/${seasonSlug(season)}`} startIcon={<ArrowOutwardIcon />} sx={ELEVATED_BUTTON_SX}>
                  Explorar {seasonName}
                </Button>
              </Box>
            </Box>

            {rowsError ? (
              <ErrorNotice title={rowsError} onRetry={() => setReloadKey((k) => k + 1)}>
                Não foi possível montar as fileiras agora. Tente novamente em instantes.
              </ErrorNotice>
            ) : loadingRows ? (
              <CardGridSkeleton />
            ) : (
              <>
                <Box component="section" aria-label="Em destaque" data-testid="today-row" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <SectionHeader title="Em destaque" note={todayLabel} />
                  {todayItems.length > 0 ? (
                    <ScrollCarousel label="No ar hoje">
                      {todayItems.map((item) => (
                        <Box key={item.key} sx={{ flex: "0 0 auto", width: CAROUSEL_CARD_WIDTH }}>
                          <ExploreCard item={item} />
                        </Box>
                      ))}
                    </ScrollCarousel>
                  ) : (
                    <EmptyPanel icon={<LiveTvOutlinedIcon />} title="Nada no ar hoje" action={<Button component={NextLink} href="/calendar" sx={ELEVATED_BUTTON_SX}>Ver o calendário</Button>}>
                      Quando houver episódios hoje, os animes que estão passando aparecem aqui.
                    </EmptyPanel>
                  )}
                </Box>
                {storyItems.length > 0 && (
                  <Box component="section" aria-label="Novas histórias, outros tempos" data-testid="stories-row" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <SectionHeader
                      title="Novas histórias, outros tempos"
                      // Com lista: terminadas nos seus gêneros e, quando elas acabam, novidades do catálogo (o selo diz o que está na tela).
                      note={personalized ? (storyItems.every((i) => i.status === "FINISHED") ? "Terminadas, nos seus gêneros" : "Nos seus gêneros e novidades do catálogo") : "Novidades e o que combina com o que você viu"}
                      chip
                    />
                    <CardGrid label="Novas histórias, outros tempos">
                      {storyItems.map((item) => (
                        <ExploreCard key={item.key} item={item} />
                      ))}
                    </CardGrid>
                  </Box>
                )}
              </>
            )}

            <SeasonChips />
          </>
        )}

        {mode === "filter" && (
          <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pager.loading ? (
              <CardGridSkeleton />
            ) : pager.failed && pager.items.length === 0 ? (
              <ErrorNotice title="Falha ao carregar o catálogo" onRetry={pager.retry}>
                Não foi possível carregar os resultados agora. Tente novamente em instantes.
              </ErrorNotice>
            ) : pager.items.length > 0 ? (
              <>
                <SectionHeader title={`${pager.total ?? pager.items.length} resultado${(pager.total ?? pager.items.length) === 1 ? "" : "s"}`} note={`Ordenado por ${SORT_LABELS[sortBy].toLowerCase()}`} />
                <CardGrid label="Resultados">
                  {pager.items.map((item) => (
                    <ExploreCard key={item.key} item={item} />
                  ))}
                </CardGrid>
                <InfiniteFooter
                  testId="catalog"
                  sentinelRef={sentinelRef}
                  supported={infiniteSupported}
                  hasMore={pager.hasMore}
                  loadingMore={pager.loadingMore}
                  failed={pager.failed}
                  onMore={pager.loadMore}
                  onRetry={pager.retry}
                  loadingLabel="Carregando mais animes…"
                  moreLabel="Ver mais animes"
                  endLabel="Você viu todos os resultados."
                />
              </>
            ) : (
              <EmptyPanel icon={<SearchOffIcon />} title="Nenhum anime encontrado" action={<Button onClick={clearFilters} variant="contained" sx={{ textTransform: "uppercase" }}>Limpar filtros</Button>}>
                Nenhum anime bate com esses filtros. Tente remover um deles ou escolher outro ano ou gênero.
              </EmptyPanel>
            )}
          </Box>
        )}

        {mode === "search" && (
          <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {searchError ? (
              <ErrorNotice title={searchError} onRetry={() => setQuery((q) => `${q} `.trimEnd())}>
                Sua busca foi mantida. Tente novamente.
              </ErrorNotice>
            ) : (searching || pager.loading) && searchList.length === 0 ? (
              <CardGridSkeleton count={1} />
            ) : searchList.length === 0 ? (
              <EmptyPanel icon={<SearchOffIcon />} title="Nenhum anime encontrado" action={<Button onClick={clearFilters} variant="contained" sx={{ textTransform: "uppercase" }}>Limpar busca</Button>}>
                Nada bate com “{query.trim()}”. Tente o título em romaji, em inglês ou em japonês.
              </EmptyPanel>
            ) : (
              <>
                {searchCached && !searching && (
                  <Alert severity="info" variant="outlined">
                    AniList fora do ar — mostrando resultados salvos localmente.
                  </Alert>
                )}
                <Typography role="status" sx={{ fontSize: 14, color: "text.secondary" }}>
                  {searching ? "Buscando..." : `${searchCount} anime${searchCount === 1 ? "" : "s"} encontrado${searchCount === 1 ? "" : "s"}`}
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(240px, 310px) minmax(0, 1fr)" }, gap: 5, alignItems: "start" }}>
                  <Box sx={{ maxWidth: { xs: 310, md: "none" } }}>
                    <ExploreCard item={searchList[0]} />
                  </Box>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    {user === null && (
                      <Box sx={{ display: "flex", gap: 2, p: 2.5, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
                        <InfoOutlinedIcon sx={{ fontSize: 20, mt: 0.25 }} />
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                          <Typography component="h2" sx={{ fontSize: 16, lineHeight: 1.5 }}>
                            Entre para acompanhar
                          </Typography>
                          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                            Você pode explorar os resultados sem conta. Para incluir este anime na sua agenda pessoal e receber novidades, faça login.
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    <NextReleasePanel item={searchList[0]} />
                    <TitlesPanel item={searchList[0]} />
                  </Box>
                </Box>
                {(searchList.length > 1 || pager.hasMore) && (
                  <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <SectionHeader title="Outros resultados" />
                    <CardGrid label="Outros resultados">
                      {searchList.slice(1).map((item) => (
                        <ExploreCard key={item.key} item={item} />
                      ))}
                    </CardGrid>
                    <InfiniteFooter
                      testId="catalog"
                      sentinelRef={sentinelRef}
                      supported={infiniteSupported}
                      hasMore={pager.hasMore}
                      loadingMore={pager.loadingMore}
                      failed={pager.failed}
                      onMore={pager.loadMore}
                      onRetry={pager.retry}
                      loadingLabel="Carregando mais animes…"
                      moreLabel="Ver mais animes"
                      endLabel="Você viu todos os resultados."
                    />
                  </Box>
                )}
              </>
            )}
          </Box>
        )}
      </PageContainer>

      <Dialog
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="more-filters-title"
        slotProps={{ paper: { sx: { bgcolor: "background.paper", backgroundImage: "none", border: 1, borderColor: "divider", borderRadius: "16px" } } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, p: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography id="more-filters-title" component="h2" sx={{ fontSize: 24, fontWeight: 700 }}>
              Mais filtros
            </Typography>
            <IconButton aria-label="Fechar" onClick={() => setMoreOpen(false)} sx={{ color: "text.secondary" }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <SelectField
              label="Status"
              value={draft.status}
              onChange={(v) => setDraft((d) => ({ ...d, status: v }))}
              width="100%"
              options={[{ value: "", label: "Todos os status" }, ...statuses.map((s) => ({ value: s, label: CATALOG_STATUS_LABELS[s] ?? s }))]}
            />
            <SelectField
              label="Ordenar por"
              value={draft.sort}
              onChange={(v) => setDraft((d) => ({ ...d, sort: v as SortKey }))}
              width="100%"
              options={(Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({ value: key, label: SORT_LABELS[key] }))}
            />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }} data-testid="more-filters-keywords">
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Palavras-chave</Typography>
            <TextField size="small" label="No título" placeholder="ex.: dragão ilha" value={draft.titleHas} onChange={(e) => setDraft((d) => ({ ...d, titleHas: e.target.value }))} helperText="Todas as palavras precisam aparecer em algum título (romaji, inglês ou japonês)." slotProps={{ htmlInput: { maxLength: 200, "data-testid": "filter-title-has" } }} />
            <TextField size="small" label="Na sinopse" placeholder="ex.: vingança pirata" value={draft.synopsisHas} onChange={(e) => setDraft((d) => ({ ...d, synopsisHas: e.target.value }))} helperText="Procura na sinopse original e na tradução em português." slotProps={{ htmlInput: { maxLength: 200, "data-testid": "filter-synopsis-has" } }} />
            <TextField size="small" label="Sem estas palavras" placeholder="ex.: isekai" value={draft.exclude} onChange={(e) => setDraft((d) => ({ ...d, exclude: e.target.value }))} helperText="Tira as obras que tenham qualquer uma delas no título ou na sinopse." slotProps={{ htmlInput: { maxLength: 200, "data-testid": "filter-exclude" } }} />
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField size="small" type="number" label="Episódios: mínimo" value={draft.epMin} onChange={(e) => setDraft((d) => ({ ...d, epMin: e.target.value }))} sx={{ flex: "1 1 140px" }} slotProps={{ htmlInput: { min: 0, max: 5000, "data-testid": "filter-ep-min" } }} />
              <TextField size="small" type="number" label="Episódios: máximo" value={draft.epMax} onChange={(e) => setDraft((d) => ({ ...d, epMax: e.target.value }))} sx={{ flex: "1 1 140px" }} slotProps={{ htmlInput: { min: 0, max: 5000, "data-testid": "filter-ep-max" } }} />
              <TextField size="small" type="number" label="Nota do site: mínima" value={draft.minScore} onChange={(e) => setDraft((d) => ({ ...d, minScore: e.target.value }))} sx={{ flex: "1 1 140px" }} slotProps={{ htmlInput: { min: 0, max: 10, step: 0.5, "data-testid": "filter-min-score" } }} />
            </Box>
          </Box>
          <SelectField
            label="Disponibilidade de previsão"
            value={draft.availability}
            onChange={(v) => setDraft((d) => ({ ...d, availability: v as "" | "scheduled" | "unscheduled" }))}
            width="100%"
            options={[
              { value: "", label: "Todos, incluindo sem data" },
              { value: "scheduled", label: "Só com horário confirmado" },
              { value: "unscheduled", label: "Só sem horário confirmado" },
            ]}
          />
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <Button onClick={() => setDraft({ status: "", availability: "", sort: "popular", ...EMPTY_KEYWORDS })} sx={ELEVATED_BUTTON_SX}>
              Limpar filtros
            </Button>
            <Button
              variant="contained"
              data-testid="more-filters-apply"
              onClick={() => {
                setSelectedStatus(draft.status);
                setAvailability(draft.availability);
                setSortBy(draft.sort);
                setKeywordFilters({ titleHas: draft.titleHas, synopsisHas: draft.synopsisHas, exclude: draft.exclude, epMin: draft.epMin, epMax: draft.epMax, minScore: draft.minScore });
                setMoreOpen(false);
              }}
            >
              Aplicar filtros
            </Button>
          </Box>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Cancelar/Esc não aplica. Aplicar atualiza o resultado e mantém o foco no botão Mais filtros.
          </Typography>
        </Box>
      </Dialog>
    </Box>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverPageContent />
    </Suspense>
  );
}
