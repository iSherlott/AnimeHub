"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { Box, Button } from "@mui/material";
import { ErrorNotice } from "@/components/StatePanels";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ExploreCard } from "@/components/ExploreCard";
import { CardGrid, CardGridSkeleton, EmptyPanel, SectionHeader, SeasonChips } from "@/components/ExploreParts";
import { SelectField } from "@/components/FilterField";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useWindowedList } from "@/lib/useWindowedList";
import type { DiscoverItem } from "@/lib/discoverItem";
import { parseSeasonSlug, SEASON_COPY, seasonDisplayName, seasonSlug, splitSeasonItems, type SeasonRef } from "@/lib/exploreGroups";
import type { AvailableSeason } from "@/lib/availableSeasons";
import { CATALOG_STATUS_LABELS } from "@/lib/types";

/**
 * Página de temporada (Figma `8:1733`, "Temporada Autumn2026"): o que está em
 * exibição (horário confirmado) e as estreias/datas a confirmar — sem nunca
 * inventar previsão. Gênero e status filtram os dois blocos.
 */
export default function SeasonPage() {
  const params = useParams<{ slug: string }>();
  const seasonRef = parseSeasonSlug(params.slug ?? "");
  if (!seasonRef) notFound();
  return <SeasonView seasonRef={seasonRef} />;
}

function SeasonView({ seasonRef: ref }: { seasonRef: SeasonRef }) {
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();
  // Temporadas que têm anime na plataforma (o filtro nunca oferece uma temporada vazia).
  const [available, setAvailable] = useState<AvailableSeason[] | null>(null);

  const { season, year } = ref;
  useEffect(() => {
    let cancelled = false;
    // Volta ao estado "carregando" a cada troca de temporada ou nova tentativa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/anilist/season?season=${season}&year=${year}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Falha ao carregar a temporada");
          return;
        }
        setItems(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Falha ao carregar a temporada");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [season, year, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/seasons")
      .then((res) => (res.ok ? res.json() : { seasons: [] }))
      .then((data: { seasons?: AvailableSeason[] }) => {
        if (!cancelled) setAvailable(data.seasons ?? []);
      })
      .catch(() => {
        if (!cancelled) setAvailable([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A temporada aberta sempre aparece (mesmo sem anime ainda); as demais, só se tiverem.
  const seasonOptions = useMemo(() => {
    const list = (available ?? []).map((s) => ({ value: s.slug, label: s.label }));
    const current = seasonSlug(ref);
    if (!list.some((o) => o.value === current)) list.push({ value: current, label: seasonDisplayName(ref) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, season, year]);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) for (const g of item.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([g]) => g);
  }, [items]);
  const statuses = useMemo(() => Array.from(new Set(items.map((i) => i.status).filter((s): s is string => Boolean(s)))), [items]);

  const filtered = useMemo(
    () => items.filter((i) => (!genre || i.genres.includes(genre)) && (!status || i.status === status)),
    [items, genre, status]
  );
  const { airing, rest } = useMemo(() => splitSeasonItems(filtered), [filtered]);
  // Rolagem infinita: a temporada chega inteira, mas os cartões aparecem aos poucos (primeiro os que estão no ar).
  const windowed = useWindowedList(useMemo(() => [...airing, ...rest], [airing, rest]), `${season}:${year}:${genre}:${status}`);
  const { ref: sentinelRef, supported: infiniteSupported } = useInfiniteScroll(windowed.loadMore, windowed.hasMore, windowed.shown);
  const airingShown = windowed.visible.slice(0, airing.length);
  const restShown = windowed.visible.slice(airing.length);
  const copy = SEASON_COPY[season];
  const label = seasonDisplayName(ref);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <PageIntro
          kicker={`${copy.kanji} / TEMPORADA`}
          title={label}
          subtitle={`Histórias de ${copy.range}. Escolha o que merece um lugar na sua agenda.`}
        />

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          <SelectField
            label="Temporada"
            value={seasonSlug(ref)}
            onChange={(slug) => router.push(`/temporada/${slug}`)}
            width={260}
            testId="season-filter"
            options={seasonOptions}
          />
          <SelectField
            label="Gênero"
            value={genre}
            onChange={setGenre}
            width={260}
            options={[{ value: "", label: "Todos os gêneros" }, ...genres.map((g) => ({ value: g, label: g }))]}
          />
          <SelectField
            label="Status"
            value={status}
            onChange={setStatus}
            width={260}
            options={[{ value: "", label: "Todos os status" }, ...statuses.map((s) => ({ value: s, label: CATALOG_STATUS_LABELS[s] ?? s }))]}
          />
        </Box>

        {error ? (
          <ErrorNotice title={error} onRetry={() => setReloadKey((k) => k + 1)}>
            A API pública da AniList pode estar instável — tente novamente em alguns minutos.
          </ErrorNotice>
        ) : loading ? (
          <CardGridSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyPanel
            title={items.length === 0 ? `Nada em ${label} ainda` : "Nenhum anime com esses filtros"}
            action={
              items.length > 0 ? (
                <Button
                  onClick={() => {
                    setGenre("");
                    setStatus("");
                  }}
                  variant="contained"
                >
                  Limpar filtros
                </Button>
              ) : undefined
            }
          >
            {items.length === 0 ? "Esta temporada ainda não tem títulos no catálogo." : "Tente remover um dos filtros."}
          </EmptyPanel>
        ) : (
          <>
            {airingShown.length > 0 && (
              <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <SectionHeader title="Em exibição" note={`${airing.length} com horário confirmado`} chip />
                <CardGrid label="Em exibição">
                  {airingShown.map((item) => (
                    <ExploreCard key={item.key} item={item} />
                  ))}
                </CardGrid>
              </Box>
            )}
            {restShown.length > 0 && (
              <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <SectionHeader title="Estreias e datas a confirmar" note="Sem previsão inventada" />
                <CardGrid label="Estreias e datas a confirmar">
                  {restShown.map((item) => (
                    <ExploreCard key={item.key} item={item} />
                  ))}
                </CardGrid>
              </Box>
            )}
            <InfiniteFooter
              testId="season"
              sentinelRef={sentinelRef}
              supported={infiniteSupported}
              hasMore={windowed.hasMore}
              loadingMore={false}
              failed={false}
              onMore={windowed.loadMore}
              onRetry={windowed.loadMore}
              moreLabel="Ver mais animes"
              endLabel={windowed.total > 48 ? "Você viu a temporada inteira." : undefined}
            />
          </>
        )}

        <SeasonChips exclude={ref} />
      </PageContainer>
    </Box>
  );
}
