import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { Header } from "@/components/Header";
import { RecentWorkTracker } from "@/components/RecentWorkTracker";
import { UnfollowButton } from "@/components/UnfollowButton";
import { PlatformLinksManager } from "@/components/PlatformLinksManager";
import { EpisodeGrid } from "@/components/EpisodeGrid";
import { AnimeMetaEditorsPopover } from "@/components/AnimeMetaEditorsPopover";
import { AnimeTitle } from "@/components/AnimeTitle";
import { AnimeDescription } from "@/components/AnimeDescription";
import { RefreshDataButton } from "@/components/RefreshDataButton";
import { OtherTitles } from "@/components/OtherTitles";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { CommentSection } from "@/components/CommentSection";
import { CastSection } from "@/components/CastSection";
import { TrailerEmbed } from "@/components/TrailerEmbed";
import { WatchLinks } from "@/components/WatchLinks";
import { ensureProduction, parseStreamingLinks } from "@/lib/production";
import { platformAnilistIds } from "@/lib/platform";
import { Row } from "@/components/Row";
import { RecommendationCard, type RecommendationData } from "@/components/RecommendationCard";
import { ensureEpisodes, type EpisodesResult } from "@/lib/episodes";
import { timed } from "@/lib/episodeState";
import { ensureTitleFurigana } from "@/lib/ensureFurigana";
import { callInternalService } from "@/lib/serviceDelegate";
import type { AniListCharacterEntry, AniListRecommendation } from "@/lib/anilist";
import { loadFranchiseSeasons } from "@/lib/franchiseSeasons";
import { WorkSeasons } from "@/components/WorkSeasons";
import { WorkSectionNav } from "@/components/WorkSectionNav";
import { AdultContentNotice, WorkBadgeRow, WorkCard, WorkInfoList } from "@/components/WorkInfoCard";
import { isAdultContent } from "@/lib/contentPolicy";
import { AppLink } from "@/components/AppLink";
import { episodesLabel, seasonLabel, statusLabel, typeLabel, workBadges, workFacts } from "@/lib/workLabels";
import { BranchOnlyTimeline } from "@/components/BranchOnlyTimeline";
import { EpisodesSkeleton } from "@/components/WorkSkeletons";
import { assignBranches, branchesOf, type Branch } from "@/lib/workJourney";
import { loadStoryContext } from "@/lib/story/context";
import { storyMarkersOf } from "@/lib/story/markers";
import type { ArcInfo } from "@/lib/story/versions";
import type { StoryMarkers } from "@/components/StoryMarkers";
import { SiteScoreChip } from "@/components/SiteScoreChip";
import { SpecialsNotice } from "@/components/WorkSpecials";
import { loadTimeline } from "@/lib/curation/timelineLoader";
import { loadFranchiseSteps, stepsFromTimeline } from "@/lib/curation/franchiseTimelineLoader";
import { FranchiseNav } from "@/components/FranchiseNav";
import { WorkHero } from "@/components/WorkHero";
import { WorkExtras } from "@/components/WorkExtras";
import { loadExtras } from "@/lib/episodeExtras";
import { WorkDiscussions, WorkQuizEntry, WorkRelated } from "@/components/WorkSections";
import { PublicWork } from "@/app/anime/[id]/PublicWork";
import { CatalogWork, PublicCatalogWork, findCatalogWork } from "@/app/anime/[id]/CatalogWork";
import { CATALOG_ONLY_SLUG } from "@/lib/workHref";

/** Um id só de dígitos é o da AniList (obra de quem ainda não a acompanha); o resto é o id da sua própria lista. */
const ANILIST_ID = /^\d{1,9}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const slug = CATALOG_ONLY_SLUG.exec(id);
  if (slug) {
    const entry = await findCatalogWork(slug[1] as "anidb" | "kitsu", Number(slug[2]));
    return { title: entry ? `${entry.titleRomaji} · Anime Hub` : "Anime Hub" };
  }
  if (!ANILIST_ID.test(id)) return { title: "Anime Hub" };
  const production = await prisma.production.findUnique({ where: { anilistId: Number(id) }, select: { titleRomaji: true } });
  return { title: production ? `${production.titleRomaji} · Anime Hub` : "Anime Hub" };
}

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (ANILIST_ID.test(id) && Number(id) > 0) return <PublicWork anilistId={Number(id)} />;
  // Obra sem AniList ID (só do AniDB ou da Kitsu): página pelo catálogo.
  const slug = CATALOG_ONLY_SLUG.exec(id);
  if (slug && Number(slug[2]) > 0) return <PublicCatalogWork source={slug[1] as "anidb" | "kitsu"} sourceId={Number(slug[2])} />;

  const user = await getCurrentUser();
  if (!user) notFound();

  const loaded = await prisma.anime.findUnique({
    where: { id },
    include: { platformLinks: true },
  });

  if (!loaded || loaded.userId !== user.id) notFound();
  // Obra sem AniList ID (só do AniDB/Kitsu): a página é a do catálogo, com os controles de quem acompanha.
  if (loaded.anilistId === null) {
    const entry = loaded.catalogEntryId ? await prisma.catalogEntry.findUnique({ where: { id: loaded.catalogEntryId } }) : null;
    if (!entry) notFound();
    return <CatalogWork entry={entry} signedIn owned={loaded} />;
  }
  const anime = loaded as typeof loaded & { anilistId: number };

  const genres = anime.genres ? anime.genres.split(",").filter(Boolean) : [];
  // Sites de streaming do catálogo (AniList) — a produção é criada/atualizada sob demanda, mas a página NUNCA
  // espera a AniList além de 1,5 s (ela pode estar lenta ou limitando requisições): sem resposta a tempo, mostra
  // o que já está no banco e a atualização termina em segundo plano.
  const refresh = ensureProduction(anime.anilistId).catch(() => null);
  const catalogProduction = await Promise.race([refresh, new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))]);
  const productionRow = catalogProduction ?? (await prisma.production.findUnique({ where: { anilistId: anime.anilistId } }));
  const catalogStreamingLinks = parseStreamingLinks(productionRow?.streamingLinksJson ?? null);
  const cast: AniListCharacterEntry[] = anime.castJson ? JSON.parse(anime.castJson) : [];
  // Só recomenda o que está na plataforma (trazido pelo admin): o resto não tem página para abrir.
  const platformIds = await platformAnilistIds();
  const rawRecommendations: AniListRecommendation[] = (anime.recommendationsJson ? (JSON.parse(anime.recommendationsJson) as AniListRecommendation[]) : []).filter((r) => platformIds.has(r.anilistId));

  // Os episódios vêm da fonte e podem demorar: começam a carregar já, e a página mostra um esqueleto até chegarem.
  // Nota: quando delegado, episodesResult.episodes[].airDate volta como string ISO (round-trip por JSON), não Date;
  // o EpisodeGrid trata os dois formatos.
  const episodesPromise = callInternalService<EpisodesResult>(process.env.CACHE_UPDATER_URL, "/ensure-episodes", {
    animeId: anime.id,
  }).then((delegated) => delegated ?? ensureEpisodes(anime));

  const [furiganaHtml, ownedRecommendedAnime, scheduleRows, imageRows, allSeasons, story] = await Promise.all([
    ensureTitleFurigana(anime),
    // Recomendações (Epic 14) apontam pra outros anilistId — resolvidas
    // contra a própria lista do usuário aqui, na hora de renderizar (não
    // gravadas assim), pra linkar internamente quando o anime recomendado
    // já estiver na lista, e pra AniList quando não estiver.
    rawRecommendations.length
      ? prisma.anime.findMany({
          where: { userId: user.id, anilistId: { in: rawRecommendations.map((r) => r.anilistId) } },
          select: { id: true, anilistId: true },
        })
      : Promise.resolve([]),
    // Data de lançamento (calendário) e imagem de cada episódio: completam o que a Kitsu não traz.
    prisma.airingScheduleEntry.findMany({ where: { anilistId: anime.anilistId }, select: { episode: true, airingAt: true } }),
    prisma.episodeImage.findMany({ where: { anilistId: anime.anilistId }, select: { episode: true, thumbnail: true } }),
    // Todas as temporadas da obra, juntas (franquia da AniList e, sem ela, o mesmo título com outro número de temporada).
    loadFranchiseSeasons(anime.anilistId),
    // Reboot e arcos (Epic 48): a outra versão da história e os arcos dos episódios.
    loadStoryContext(anime.anilistId),
  ]);
  // As temporadas da outra versão da história (reboot) não entram nas desta.
  const otherVersion = new Set(story.otherVersionIds);
  const franchiseSeasons = allSeasons.filter((s) => !otherVersion.has(s.anilistId));
  const schedule = Object.fromEntries(timed(scheduleRows).map((r) => [r.episode, r.airingAt.toISOString()]));
  const episodeImages = Object.fromEntries(imageRows.map((r) => [r.episode, r.thumbnail]));

  // O andamento de cada temporada da obra na lista de quem olha (para escolher: acompanhando, terminei, dropei…).
  const mySeasonRows = await prisma.anime.findMany({
    where: { userId: user.id, anilistId: { in: franchiseSeasons.map((s) => s.anilistId) } },
    select: { id: true, anilistId: true, watchState: true, waiting: true, userScore: true },
  });
  const mySeasons = Object.fromEntries(mySeasonRows.map((a) => [a.anilistId, { animeId: a.id, watchState: a.watchState, waiting: a.waiting, userScore: a.userScore }]));

  // Nota do site e linha do tempo (especiais) da obra; o site oficial do catálogo cobre quem ainda não o tem na lista.
  const [catalogMeta, timeline, franchiseSteps, extras] = await Promise.all([
    prisma.catalogEntry.findUnique({ where: { anilistId: anime.anilistId }, select: { siteScore: true, siteScoreVotes: true, kind: true, officialSite: true, descriptionPt: true, descriptionJa: true, format: true, status: true, season: true, seasonYear: true, episodes: true } }),
    loadTimeline(anime.anilistId),
    loadFranchiseSteps(anime.anilistId),
    // Especiais, aberturas, trailers… do AniDB: seção própria, fora da sequência de episódios.
    loadExtras({ anilistId: anime.anilistId }),
  ]);
  const officialSite = anime.officialSite ?? catalogMeta?.officialSite ?? null;
  // OVA, ODA e filmes se ramificam da temporada em que foram ao ar; a página mostra os da temporada aberta junto dos episódios.
  const branches = assignBranches(franchiseSeasons, branchesOf(timeline?.specials ?? []));
  // A franquia em ordem: a gravada pela auditoria ou, enquanto ela não passou, a das relações da AniList.
  const navStepsAll = (franchiseSteps ?? stepsFromTimeline(timeline))?.filter((s) => !otherVersion.has(s.anilistId)) ?? null;
  const navSteps = navStepsAll && navStepsAll.length >= 2 ? navStepsAll : null;
  const markers = storyMarkersOf(story.relations);

  const animeIdByAnilistId = new Map(ownedRecommendedAnime.map((a) => [a.anilistId, a.id]));
  const recommendations: RecommendationData[] = rawRecommendations.map((rec) => {
    const ownAnimeId = animeIdByAnilistId.get(rec.anilistId);
    return {
      ...rec,
      isInternal: true, // sempre interno: lista própria ou página pública da obra
      href: ownAnimeId ? `/anime/${ownAnimeId}` : `/anime/${rec.anilistId}`,
    };
  });

  const titlePrimary = anime.titleNative ?? anime.titleRomaji;
  // A cópia da lista pode ter ficado sem ano, temporada ou formato: o que faltar vem do catálogo.
  const facts = workFacts(anime, catalogMeta);
  const badges = workBadges({ kind: catalogMeta?.kind, ...facts });
  const awards = anime.anidbAwards ? anime.anidbAwards.split(",").filter(Boolean) : [];
  const resources = anime.anidbResources ? (JSON.parse(anime.anidbResources) as Record<string, string>) : null;
  const hasTrailer = anime.trailerSite?.toLowerCase() === "youtube" && Boolean(anime.trailerId);
  const headingSx = { fontSize: 26, lineHeight: 1.5 } as const;

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <RecentWorkTracker anilistId={anime.anilistId} />

      <WorkHero bannerImage={anime.bannerImage} coverImage={anime.coverImage} accentColor={anime.accentColor}>
        <Box sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 2 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            <AppLink href="/minha-lista" underline="hover" color="inherit">
              MINHA LISTA
            </AppLink>{" "}
            / <span lang={anime.titleNative ? "ja" : undefined}>{titlePrimary}</span>
          </Typography>
          <Box>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Typography component="h1" data-testid="anime-title" variant="h3" className="font-display" sx={{ textTransform: "uppercase", lineHeight: 1, fontSize: { xs: "2.25rem", sm: "3rem" }, overflowWrap: "anywhere" }}>
                <AnimeTitle titles={{ titleRomaji: anime.titleRomaji, titleEnglish: anime.titleEnglish, titleNative: anime.titleNative, titlePortuguese: anime.titlePortuguese }} furiganaHtml={furiganaHtml} />
              </Typography>
              <SiteScoreChip score={catalogMeta?.siteScore ?? 5} votes={catalogMeta?.siteScoreVotes ?? 0} />
              <FavoriteToggle animeId={anime.id} initialFavorite={anime.isFavorite} />
            </Stack>
            {anime.titleNative && (
              <Typography className="font-jp" variant="h6" sx={{ mt: 0.5, color: "text.secondary" }}>
                {anime.titleNative}
              </Typography>
            )}
            {anime.titleEnglish && anime.titleEnglish !== anime.titleRomaji && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {anime.titleEnglish}
              </Typography>
            )}
          </Box>
          <WorkBadgeRow badges={badges} />
          {isAdultContent(genres) && <AdultContentNotice />}
          {genres.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", rowGap: 1 }}>
              {genres.map((g) => (
                <Chip key={g} component="a" href={`/discover?genre=${encodeURIComponent(g)}`} clickable label={g} size="small" sx={{ fontWeight: 700, textTransform: "uppercase" }} />
              ))}
            </Stack>
          )}
        </Box>
      </WorkHero>

      <WorkSectionNav
        sections={[
          { id: "visao-geral", label: "Visão geral" },
          { id: "franquia", label: "Franquia" },
          { id: "episodios", label: "Episódios" },
          { id: "trailer", label: "Trailer" },
          { id: "elenco", label: "Elenco" },
          { id: "comunidade", label: "Comunidade" },
          { id: "relacionadas", label: "Relacionadas" },
        ]}
      />

      <Box sx={{ mt: 4, px: { xs: 3, sm: 5 }, display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) minmax(0,360px)" }, columnGap: 5, rowGap: 4, alignItems: "start" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <Box component="section" id="visao-geral" aria-labelledby="sinopse-heading" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
            <Typography id="sinopse-heading" component="h2" sx={headingSx}>
              Sinopse
            </Typography>
            {anime.description ? (
              <AnimeDescription description={anime.description} descriptionPortuguese={anime.descriptionPortuguese} anilistId={anime.anilistId} stored={{ pt: catalogMeta?.descriptionPt, ja: catalogMeta?.descriptionJa }} />
            ) : (
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Sem sinopse disponível.</Typography>
            )}
            <SpecialsNotice timeline={timeline} />
          </Box>

          {navSteps && (
            <Box id="franquia" sx={{ scrollMarginTop: 150 }}>
              <FranchiseNav steps={navSteps} />
            </Box>
          )}

          <Box id="episodios" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
            {franchiseSeasons.length < 2 && (
              <Typography component="h2" sx={headingSx}>
                Episódios
              </Typography>
            )}
            <WorkSeasons seasons={franchiseSeasons} mine={mySeasons} signedIn branches={branches}>
              <Suspense fallback={<EpisodesSkeleton />}>
                <EpisodesPanel
                  episodesPromise={episodesPromise}
                  hasSchedule={scheduleRows.length > 0}
                  schedule={schedule}
                  episodeImages={episodeImages}
                  fallbackImage={anime.coverImage}
                  accentColor={anime.accentColor}
                  branches={branches[anime.anilistId] ?? []}
                  arcs={story.arcs}
                  markers={markers}
                />
              </Suspense>
            </WorkSeasons>
            <WorkExtras extras={extras} />
          </Box>

          {hasTrailer && (
            <Box component="section" id="trailer" aria-labelledby="trailer-heading" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
              <Typography id="trailer-heading" component="h2" sx={headingSx}>
                Trailer
              </Typography>
              <TrailerEmbed id={anime.trailerId as string} />
            </Box>
          )}

          {cast.length > 0 && (
            <Box component="section" id="elenco" aria-labelledby="elenco-heading" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
              <Typography id="elenco-heading" component="h2" sx={headingSx}>
                Elenco
              </Typography>
              <CastSection cast={cast} />
            </Box>
          )}
        </Box>

        <Box component="aside" aria-label="Informações da obra" sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <WorkCard title="Ficha" testId="work-card-info">
            <WorkInfoList
              rows={[
                ["Tipo", typeLabel({ kind: catalogMeta?.kind, format: facts.format })],
                ["Situação", statusLabel(facts.status)],
                ["Época", seasonLabel(facts)],
                ["Episódios", episodesLabel(facts.episodes)],
                ["Temporada", `Temporada ${productionRow?.seasonNumber ?? anime.seasonNumber}`],
                ["Nota da AniList", anime.averageScore ? `${(anime.averageScore / 10).toFixed(1)} / 10` : null],
                ["Nota da AniDB", anime.anidbRating ? `${anime.anidbRating.toFixed(1)} / 10${anime.anidbVotes ? ` (${anime.anidbVotes} votos)` : ""}` : null],
                [
                  "Site oficial",
                  officialSite ? (
                    <AppLink key="site" href={officialSite} target="_blank" rel="noopener noreferrer" underline="hover" data-testid="official-site">
                      Abrir ↗
                    </AppLink>
                  ) : null,
                ],
              ]}
            />
            <OtherTitles titlesJson={anime.anidbTitles} />
          </WorkCard>

          <WorkCard title="Onde assistir" testId="work-card-watch">
            <WatchLinks links={catalogStreamingLinks} emptyText="Nenhum site de streaming informado pela fonte." />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Onde eu assisto
            </Typography>
            <PlatformLinksManager animeId={anime.id} initialLinks={anime.platformLinks} />
          </WorkCard>

          <WorkQuizEntry anilistId={anime.anilistId} userId={user.id} />

          {(awards.length > 0 || resources) && (
            <WorkCard title="Dados da AniDB" testId="work-card-anidb">
              {awards.length > 0 && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  🏆 {awards.join(" · ")}
                </Typography>
              )}
              {resources && (
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {Object.entries(resources).map(([label, url]) => (
                    <Chip key={label} component="a" href={url} target="_blank" rel="noopener noreferrer" clickable label={`${label} ↗`} size="small" variant="outlined" sx={{ textTransform: "uppercase" }} />
                  ))}
                </Stack>
              )}
            </WorkCard>
          )}

          <WorkCard title="Sua lista" testId="work-card-list">
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <RefreshDataButton animeId={anime.id} />
              <AnimeMetaEditorsPopover
                animeId={anime.id}
                seriesKey={anime.seriesKey ?? anime.titleRomaji.toLowerCase()}
                seasonNumber={anime.seasonNumber}
                titlePortuguese={anime.titlePortuguese}
                descriptionPortuguese={anime.descriptionPortuguese}
                anidbId={anime.anidbId}
              />
            </Stack>
            {anime.lastRefreshedAt && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Atualizado em {anime.lastRefreshedAt.toLocaleDateString("pt-BR")}
              </Typography>
            )}
            <UnfollowButton animeId={anime.id} title={anime.titleEnglish ?? anime.titleRomaji} />
          </WorkCard>
        </Box>
      </Box>

      <Box id="comunidade" sx={{ mt: 6, px: { xs: 3, sm: 5 }, display: "flex", flexDirection: "column", gap: 5, scrollMarginTop: 150 }}>
        <Box component="section" aria-labelledby="comentarios-heading" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography id="comentarios-heading" component="h2" sx={headingSx}>
            Comentários
          </Typography>
          <CommentSection animeId={anime.id} accentColor={anime.accentColor} />
        </Box>
        <WorkDiscussions
          anilistId={anime.anilistId}
          titleNative={anime.titleNative}
          titleRomaji={anime.titleRomaji}
          titleEnglish={anime.titleEnglish}
          seasonNumber={productionRow?.seasonNumber ?? anime.seasonNumber}
          loggedIn
        />
        <WorkRelated anilistId={anime.anilistId} franchiseId={productionRow?.franchiseId ?? null} relationsJson={productionRow?.relationsJson ?? null} seasonIds={franchiseSeasons.map((x) => x.anilistId)} story={story.relations} />
      </Box>

      {recommendations.length > 0 && (
        <Row title="Recomendados">
          {recommendations.map((rec) => (
            <RecommendationCard key={rec.anilistId} rec={rec} />
          ))}
        </Row>
      )}
    </div>
  );
}

/** Os episódios da obra em linha do tempo; é aqui que a página espera a fonte (o resto já apareceu). */
async function EpisodesPanel({
  episodesPromise,
  hasSchedule,
  schedule,
  episodeImages,
  fallbackImage,
  accentColor,
  branches,
  arcs,
  markers,
}: {
  episodesPromise: Promise<EpisodesResult>;
  hasSchedule: boolean;
  schedule: Record<number, string>;
  episodeImages: Record<number, string>;
  fallbackImage: string | null;
  accentColor: string | null;
  branches: Branch[];
  arcs: ArcInfo[];
  markers: StoryMarkers;
}) {
  const episodesResult = await episodesPromise;
  if (episodesResult.episodes.length > 0 || hasSchedule) {
    return <EpisodeGrid episodes={episodesResult.episodes} schedule={schedule} episodeImages={episodeImages} fallbackImage={fallbackImage} accentColor={accentColor} branches={branches} arcs={arcs} markers={markers} />;
  }
  return <BranchOnlyTimeline message={episodesResult.error ? `Não foi possível carregar os episódios (${episodesResult.error}).` : "Nenhum episódio encontrado para este anime."} branches={branches} arcs={arcs} markers={markers} />;
}
