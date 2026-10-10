"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound, useParams } from "next/navigation";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Button, Menu, MenuItem } from "@mui/material";
import { ErrorNotice } from "@/components/StatePanels";
import NextLink from "next/link";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ELEVATED_BUTTON_SX, ExploreCard } from "@/components/ExploreCard";
import { CardGrid, CardGridSkeleton, EmptyPanel, SectionHeader, SeasonChips } from "@/components/ExploreParts";
import { SelectField } from "@/components/FilterField";
import type { DiscoverItem } from "@/lib/discoverItem";
import { parseSeasonSlug, recentSeasons, SEASON_COPY, seasonLabel, seasonSlug, splitSeasonItems, type SeasonRef } from "@/lib/exploreGroups";
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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

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
  const copy = SEASON_COPY[season];
  const label = seasonLabel(ref);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <PageIntro
          kicker={`${copy.kanji} / TEMPORADA`}
          title={label}
          subtitle={`Histórias de ${copy.range}. Escolha o que merece um lugar na sua agenda.`}
          action={
            <>
              <Button
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                startIcon={<ExpandMoreIcon />}
                aria-haspopup="menu"
                aria-expanded={Boolean(menuAnchor)}
                sx={ELEVATED_BUTTON_SX}
              >
                Todas as temporadas
              </Button>
              <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
                {recentSeasons(new Date(), 8).map((s) => (
                  <MenuItem key={seasonSlug(s)} component={NextLink} href={`/temporada/${seasonSlug(s)}`} selected={s.season === season && s.year === year} onClick={() => setMenuAnchor(null)}>
                    {seasonLabel(s)}
                  </MenuItem>
                ))}
              </Menu>
            </>
          }
        />

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
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
            {airing.length > 0 && (
              <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <SectionHeader title="Em exibição" note={`${airing.length} com horário confirmado`} chip />
                <CardGrid label="Em exibição">
                  {airing.map((item) => (
                    <ExploreCard key={item.key} item={item} />
                  ))}
                </CardGrid>
              </Box>
            )}
            {rest.length > 0 && (
              <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <SectionHeader title="Estreias e datas a confirmar" note="Sem previsão inventada" />
                <CardGrid label="Estreias e datas a confirmar">
                  {rest.map((item) => (
                    <ExploreCard key={item.key} item={item} />
                  ))}
                </CardGrid>
              </Box>
            )}
          </>
        )}

        <SeasonChips exclude={ref} />
      </PageContainer>
    </Box>
  );
}
