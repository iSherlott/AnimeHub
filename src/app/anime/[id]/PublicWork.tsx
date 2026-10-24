import { notFound, redirect } from "next/navigation";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureProduction, parseStreamingLinks } from "@/lib/production";
import { loadFranchiseSeasons } from "@/lib/franchiseSeasons";
import { Header } from "@/components/Header";
import { RecentWorkTracker } from "@/components/RecentWorkTracker";
import { AnimeTitle } from "@/components/AnimeTitle";
import { AppLink } from "@/components/AppLink";
import { FollowProductionButton } from "@/components/FollowProductionButton";
import { WorkSeasons } from "@/components/WorkSeasons";
import { WorkSectionNav } from "@/components/WorkSectionNav";
import { AdultContentNotice, WorkBadgeRow, WorkCard, WorkInfoList } from "@/components/WorkInfoCard";
import { isAdultContent } from "@/lib/contentPolicy";
import { episodesLabel, seasonLabel, statusLabel, typeLabel, workBadges, workFacts } from "@/lib/workLabels";
import { BranchOnlyTimeline } from "@/components/BranchOnlyTimeline";
import { assignBranches, branchesOf } from "@/lib/workJourney";
import { loadStoryContext } from "@/lib/story/context";
import { storyMarkersOf } from "@/lib/story/markers";
import { SiteScoreChip } from "@/components/SiteScoreChip";
import { SpecialsNotice } from "@/components/WorkSpecials";
import { loadTimeline } from "@/lib/curation/timelineLoader";
import { loadFranchiseSteps, stepsFromTimeline } from "@/lib/curation/franchiseTimelineLoader";
import { FranchiseNav } from "@/components/FranchiseNav";
import { NextEpisodeBlock } from "@/components/NextEpisodeBlock";
import { ScheduleEpisodeList } from "@/components/ScheduleEpisodeList";
import { SynopsisText } from "@/components/SynopsisText";
import { WatchLinks } from "@/components/WatchLinks";
import { WorkHero } from "@/components/WorkHero";
import { WorkDiscussions, WorkQuizEntry, WorkRelated } from "@/components/WorkSections";

/**
 * Detalhe de uma obra para quem ainda não a acompanha (e para visitantes): o MESMO desenho da página pessoal
 * (`/anime/<id>`), alimentado pela produção canônica. Quem já acompanha a obra é levado para a página dela.
 */
const headingSx = { fontSize: 26, lineHeight: 1.5 } as const;

export async function PublicWork({ anilistId }: { anilistId: number }) {
  const production = await ensureProduction(anilistId);
  if (!production) notFound();

  const user = await getCurrentUser();
  const owned = user
    ? await prisma.anime.findUnique({
        where: { userId_anilistId: { userId: user.id, anilistId } },
        select: { id: true, platformLinks: { orderBy: { createdAt: "asc" }, select: { id: true, platform: true, url: true } } },
      })
    : null;
  if (owned) redirect(`/anime/${owned.id}`);

  const [nextEpisode, catalog, allSeasons, schedule, images, timeline, franchiseSteps, story] = await Promise.all([
    prisma.airingScheduleEntry.findFirst({ where: { anilistId, airingAt: { gte: new Date() } }, orderBy: { airingAt: "asc" } }),
    prisma.catalogEntry.findUnique({ where: { anilistId }, select: { siteScore: true, siteScoreVotes: true, kind: true, officialSite: true, descriptionPt: true, descriptionJa: true, format: true, status: true, season: true, seasonYear: true, episodes: true } }),
    loadFranchiseSeasons(anilistId),
    prisma.airingScheduleEntry.findMany({ where: { anilistId }, orderBy: { episode: "asc" }, select: { episode: true, airingAt: true } }),
    prisma.episodeImage.findMany({ where: { anilistId }, select: { episode: true, thumbnail: true } }),
    loadTimeline(anilistId),
    loadFranchiseSteps(anilistId),
    // Reboot e arcos (Epic 48): a outra versão da história e os arcos dos episódios.
    loadStoryContext(anilistId),
  ]);
  // As temporadas da outra versão da história (reboot) não entram nas desta.
  const otherVersion = new Set(story.otherVersionIds);
  const seasons = allSeasons.filter((s) => !otherVersion.has(s.anilistId));
  const officialSite = production.officialSite ?? catalog?.officialSite ?? null;
  // OVA, ODA e filmes se ramificam da temporada em que foram ao ar.
  const branches = assignBranches(seasons, branchesOf(timeline?.specials ?? []));
  // A franquia em ordem: a gravada pela auditoria ou, enquanto ela não passou, a das relações da AniList.
  const navStepsAll = (franchiseSteps ?? stepsFromTimeline(timeline))?.filter((s) => !otherVersion.has(s.anilistId)) ?? null;
  const navSteps = navStepsAll && navStepsAll.length >= 2 ? navStepsAll : null;
  const markers = storyMarkersOf(story.relations);
  const imageByEpisode = new Map(images.map((i) => [i.episode, i.thumbnail]));
  const genres = production.genres ? production.genres.split(",").filter(Boolean) : [];
  const titlePrimary = production.titleNative ?? production.titleRomaji;

  // A produção pode ter ficado sem ano, temporada ou episódios: o que faltar vem do catálogo.
  const facts = workFacts(production, catalog);
  const badges = workBadges({ kind: catalog?.kind, ...facts });

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <RecentWorkTracker anilistId={anilistId} />

      <WorkHero bannerImage={production.bannerImage} coverImage={production.coverImage}>
        <Box sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 2 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            <AppLink href="/discover" underline="hover" color="inherit">
              EXPLORAR
            </AppLink>{" "}
            / <span lang={production.titleNative ? "ja" : undefined}>{titlePrimary}</span>
          </Typography>
          <Box>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Typography component="h1" data-testid="anime-title" variant="h3" className="font-display" sx={{ textTransform: "uppercase", lineHeight: 1, fontSize: { xs: "2.25rem", sm: "3rem" }, overflowWrap: "anywhere" }}>
                <AnimeTitle titles={{ titleRomaji: production.titleRomaji, titleEnglish: production.titleEnglish, titleNative: production.titleNative }} />
              </Typography>
              <SiteScoreChip score={catalog?.siteScore ?? 5} votes={catalog?.siteScoreVotes ?? 0} />
            </Stack>
            {production.titleNative && (
              <Typography className="font-jp" variant="h6" sx={{ mt: 0.5, color: "text.secondary" }}>
                {production.titleNative}
              </Typography>
            )}
            {production.titleEnglish && production.titleEnglish !== production.titleRomaji && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {production.titleEnglish}
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

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <FollowProductionButton anilistId={anilistId} initialAnimeId={null} loggedIn={Boolean(user)} />
            {!user && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Entre para criar sua agenda pessoal.</Typography>}
          </Box>
          {/* Obra que já acabou e sem episódio por vir não tem "próximo episódio" para mostrar. */}
          {(nextEpisode || (facts.status !== "FINISHED" && facts.status !== "CANCELLED")) && (
            <NextEpisodeBlock iso={nextEpisode ? nextEpisode.airingAt.toISOString() : null} episode={nextEpisode ? nextEpisode.episode : null} />
          )}
        </Box>
      </WorkHero>

      <WorkSectionNav
        sections={[
          { id: "visao-geral", label: "Visão geral" },
          { id: "franquia", label: "Franquia" },
          { id: "episodios", label: "Episódios" },
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
            <SynopsisText description={production.description} anilistId={production.anilistId} stored={{ pt: catalog?.descriptionPt, ja: catalog?.descriptionJa }} sx={{ fontSize: 16 }} />
            <SpecialsNotice timeline={timeline} />
          </Box>

          {navSteps && (
            <Box id="franquia" sx={{ scrollMarginTop: 150 }}>
              <FranchiseNav steps={navSteps} />
            </Box>
          )}

          <Box id="episodios" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
            {(schedule.length > 0 || seasons.length > 1 || (branches[anilistId]?.length ?? 0) > 0 || story.arcs.length > 0) && (
              <>
                {seasons.length < 2 && (
                  <Typography component="h2" sx={headingSx}>
                    Episódios
                  </Typography>
                )}
                <WorkSeasons seasons={seasons} signedIn={Boolean(user)} branches={branches}>
                  {schedule.length > 0 ? (
                    <ScheduleEpisodeList episodes={schedule.map((s) => ({ episode: s.episode, airingAt: s.airingAt.toISOString(), image: imageByEpisode.get(s.episode) ?? null }))} branches={branches[anilistId] ?? []} arcs={story.arcs} markers={markers} />
                  ) : (
                    <BranchOnlyTimeline message="Os episódios desta temporada ainda não têm data no calendário." branches={branches[anilistId] ?? []} arcs={story.arcs} markers={markers} />
                  )}
                </WorkSeasons>
              </>
            )}
          </Box>
        </Box>

        <Box component="aside" aria-label="Informações da obra" sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <WorkCard title="Ficha" testId="work-card-info">
            <WorkInfoList
              rows={[
                ["Tipo", typeLabel({ kind: catalog?.kind, format: facts.format })],
                ["Situação", statusLabel(facts.status)],
                ["Época", seasonLabel(facts)],
                ["Episódios", episodesLabel(facts.episodes)],
                ["Temporada", `Temporada ${production.seasonNumber}`],
                ["Franquia", production.franchise.name],
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
          </WorkCard>

          <WorkCard title="Onde assistir" testId="work-card-watch">
            <WatchLinks links={parseStreamingLinks(production.streamingLinksJson)} />
          </WorkCard>

          <WorkCard title="Onde eu assisto" testId="my-watch-source">
            <Typography data-testid="my-watch-source-hint" sx={{ fontSize: 14, color: "text.secondary" }}>
              {user ? "Acompanhe esta obra para guardar o link do site onde você assiste." : "Entre e acompanhe esta obra para guardar o link do site onde você assiste."}
            </Typography>
          </WorkCard>

          <WorkQuizEntry anilistId={anilistId} userId={user?.id ?? null} />
        </Box>
      </Box>

      <Box id="comunidade" sx={{ mt: 6, px: { xs: 3, sm: 5 }, display: "flex", flexDirection: "column", gap: 5, scrollMarginTop: 150 }}>
        <WorkDiscussions
          anilistId={anilistId}
          titleNative={production.titleNative}
          titleRomaji={production.titleRomaji}
          titleEnglish={production.titleEnglish}
          seasonNumber={production.seasonNumber}
          loggedIn={Boolean(user)}
        />
        <WorkRelated anilistId={anilistId} franchiseId={production.franchiseId} relationsJson={production.relationsJson} seasonIds={seasons.map((s) => s.anilistId)} story={story.relations} />
      </Box>
    </div>
  );
}
