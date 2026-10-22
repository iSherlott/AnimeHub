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
import { FranchiseSeasons } from "@/components/FranchiseSeasons";
import { SiteScoreChip } from "@/components/SiteScoreChip";
import { SpecialsNotice, WorkSpecials } from "@/components/WorkSpecials";
import { loadTimeline } from "@/lib/curation/timelineLoader";
import { KIND_LABELS, type Kind } from "@/lib/curation/kind";
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
const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Filme", OVA: "OVA", ONA: "ONA", SPECIAL: "Especial", MUSIC: "Música" };
const STATUS_LABEL: Record<string, string> = { RELEASING: "Em exibição", FINISHED: "Finalizado", NOT_YET_RELEASED: "Ainda não lançado", CANCELLED: "Cancelado", HIATUS: "Em hiato" };
const SEASON_LABEL: Record<string, string> = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };

const headingSx = { fontSize: 26, lineHeight: 1.5 } as const;
const smallHeadingSx = { fontSize: 12, fontWeight: 700, color: "text.secondary", textTransform: "uppercase" } as const;

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

  const [nextEpisode, catalog, seasons, schedule, images, timeline] = await Promise.all([
    prisma.airingScheduleEntry.findFirst({ where: { anilistId, airingAt: { gte: new Date() } }, orderBy: { airingAt: "asc" } }),
    prisma.catalogEntry.findUnique({ where: { anilistId }, select: { siteScore: true, siteScoreVotes: true, kind: true, officialSite: true, descriptionPt: true, descriptionJa: true } }),
    loadFranchiseSeasons(anilistId),
    prisma.airingScheduleEntry.findMany({ where: { anilistId }, orderBy: { episode: "asc" }, select: { episode: true, airingAt: true } }),
    prisma.episodeImage.findMany({ where: { anilistId }, select: { episode: true, thumbnail: true } }),
    loadTimeline(anilistId),
  ]);
  const officialSite = production.officialSite ?? catalog?.officialSite ?? null;
  const imageByEpisode = new Map(images.map((i) => [i.episode, i.thumbnail]));
  const genres = production.genres ? production.genres.split(",").filter(Boolean) : [];
  const titlePrimary = production.titleNative ?? production.titleRomaji;

  const info: Array<[string, string]> = [
    ["Tipo", catalog?.kind ? `${KIND_LABELS[catalog.kind as Kind] ?? catalog.kind}${production.format ? ` (${FORMAT_LABEL[production.format] ?? production.format})` : ""}` : production.format ? (FORMAT_LABEL[production.format] ?? production.format) : "—"],
    ["Temporada", production.season && production.seasonYear ? `${SEASON_LABEL[production.season] ?? production.season} ${production.seasonYear}` : production.seasonYear ? String(production.seasonYear) : "—"],
    ["Status", production.status ? (STATUS_LABEL[production.status] ?? production.status) : "—"],
    ["Episódios", production.episodes ? String(production.episodes) : "—"],
    ["Produção", `Temporada ${production.seasonNumber}`],
    ["Franquia", production.franchise.name],
  ];

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <RecentWorkTracker anilistId={anilistId} />

      <WorkHero bannerImage={production.bannerImage} coverImage={production.coverImage}>
        <Box sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 3 }}>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            <AppLink href="/discover" underline="hover" color="inherit">
              EXPLORAR
            </AppLink>{" "}
            / <span lang={production.titleNative ? "ja" : undefined}>{titlePrimary}</span>
          </Typography>
          <Box>
            <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 0.5 }}>
              {[production.status ? (STATUS_LABEL[production.status] ?? production.status) : null, production.format ? (FORMAT_LABEL[production.format] ?? production.format) : null].filter(Boolean).join(" · ")}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Typography component="h1" data-testid="anime-title" variant="h3" className="font-display" sx={{ textTransform: "uppercase", lineHeight: 1 }}>
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

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <FollowProductionButton anilistId={anilistId} initialAnimeId={null} loggedIn={Boolean(user)} />
            {!user && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Entre para criar sua agenda pessoal.</Typography>}
          </Box>
          <NextEpisodeBlock iso={nextEpisode ? nextEpisode.airingAt.toISOString() : null} episode={nextEpisode ? nextEpisode.episode : null} />

          {genres.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", rowGap: 1 }}>
              {genres.map((g) => (
                <Chip key={g} component="a" href={`/discover?genre=${encodeURIComponent(g)}`} clickable label={g} size="small" sx={{ fontWeight: 700, textTransform: "uppercase" }} />
              ))}
            </Stack>
          )}
        </Box>
      </WorkHero>

      <Box id="visao-geral" sx={{ mt: 4, px: { xs: 3, sm: 5 }, display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) minmax(0,360px)" }, columnGap: 5, rowGap: 4, alignItems: "start" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <Box component="section" aria-labelledby="sinopse-heading" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography id="sinopse-heading" component="h2" sx={headingSx}>
              Sinopse
            </Typography>
            <SynopsisText description={production.description} anilistId={production.anilistId} stored={{ pt: catalog?.descriptionPt, ja: catalog?.descriptionJa }} sx={{ fontSize: 16 }} />
          </Box>
          <SpecialsNotice timeline={timeline} />
          <FranchiseSeasons seasons={seasons} signedIn={Boolean(user)} />
          <WorkSpecials timeline={timeline} />
        </Box>

        <Box component="section" aria-labelledby="info-heading" sx={{ bgcolor: "background.paper", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography id="info-heading" component="h2" sx={headingSx}>
            Informações
          </Typography>
          <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.5, m: 0, fontSize: 14 }}>
            {info.map(([label, value]) => (
              <Box key={label} sx={{ display: "contents" }}>
                <Typography component="dt" sx={{ fontSize: 14, color: "text.secondary" }}>
                  {label}
                </Typography>
                <Typography component="dd" sx={{ fontSize: 14, m: 0 }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box component="section" aria-labelledby="watch-heading" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography id="watch-heading" component="h3" sx={smallHeadingSx}>
              Onde assistir
            </Typography>
            <WatchLinks links={parseStreamingLinks(production.streamingLinksJson)} />
          </Box>
          <Box component="section" aria-labelledby="my-source-heading" data-testid="my-watch-source" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography id="my-source-heading" component="h3" sx={smallHeadingSx}>
              Onde eu assisto
            </Typography>
            <Typography data-testid="my-watch-source-hint" sx={{ fontSize: 14, color: "text.secondary" }}>
              {user ? "Acompanhe esta obra para guardar o link do site onde você assiste." : "Entre e acompanhe esta obra para guardar o link do site onde você assiste."}
            </Typography>
          </Box>
          <WorkQuizEntry anilistId={anilistId} userId={user?.id ?? null} />
          {officialSite && (
            <Box>
              <AppLink
                href={officialSite}
                target="_blank"
                rel="noopener noreferrer"
                underline="none"
                data-testid="official-site"
                sx={{ display: "inline-flex", alignItems: "center", minHeight: 44, px: 2, py: 1.5, borderRadius: "10px", bgcolor: "#171820", color: "text.primary", fontSize: 14, fontWeight: 700 }}
              >
                ↗ Site oficial
              </AppLink>
              <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>Links externos abrem em outra aba.</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {schedule.length > 0 && (
        <Box component="section" aria-labelledby="episodios-heading" sx={{ mt: 4, px: { xs: 3, sm: 5 }, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography id="episodios-heading" component="h2" sx={headingSx}>
            Episódios
          </Typography>
          <ScheduleEpisodeList episodes={schedule.map((s) => ({ episode: s.episode, airingAt: s.airingAt.toISOString(), image: imageByEpisode.get(s.episode) ?? null }))} />
        </Box>
      )}

      <Box sx={{ mt: 4, px: { xs: 3, sm: 5 }, display: "flex", flexDirection: "column", gap: 5 }}>
        <WorkDiscussions
          anilistId={anilistId}
          titleNative={production.titleNative}
          titleRomaji={production.titleRomaji}
          titleEnglish={production.titleEnglish}
          seasonNumber={production.seasonNumber}
          loggedIn={Boolean(user)}
        />
        <WorkRelated anilistId={anilistId} franchiseId={production.franchiseId} relationsJson={production.relationsJson} seasonIds={seasons.map((s) => s.anilistId)} />
      </Box>
    </div>
  );
}
