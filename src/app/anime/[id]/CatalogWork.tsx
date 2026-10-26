import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { CatalogEntry, PlatformLink } from "@prisma/client";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { LinkButton } from "@/components/LinkButton";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { PlatformLinksManager } from "@/components/PlatformLinksManager";
import { SeasonControls } from "@/components/SeasonControls";
import { UnfollowButton } from "@/components/UnfollowButton";
import { CommentSection } from "@/components/CommentSection";
import { WorkDiscussions, WorkQuizEntry } from "@/components/WorkSections";
import { catalogSlug } from "@/lib/workHref";
import { Header } from "@/components/Header";
import { AnimeTitle } from "@/components/AnimeTitle";
import { AppLink } from "@/components/AppLink";
import { WorkSectionNav } from "@/components/WorkSectionNav";
import { AdultContentNotice, WorkBadgeRow, WorkCard, WorkInfoList } from "@/components/WorkInfoCard";
import { isAdultContent } from "@/lib/contentPolicy";
import { episodesLabel, seasonLabel, statusLabel, typeLabel, workBadges, workFacts } from "@/lib/workLabels";
import { SiteScoreChip } from "@/components/SiteScoreChip";
import { ScheduleEpisodeList } from "@/components/ScheduleEpisodeList";
import { asScheduledEpisodes, loadCatalogEpisodes } from "@/lib/globalEpisodes";
import { SynopsisText } from "@/components/SynopsisText";
import { WorkHero } from "@/components/WorkHero";
import { WorkExtras } from "@/components/WorkExtras";
import { loadExtras } from "@/lib/episodeExtras";

const headingSx = { fontSize: 26, lineHeight: 1.5 } as const;

/** A obra do catálogo por trás de `/anime/anidb-<id>` ou `/anime/kitsu-<id>` (só as que o admin trouxe para a plataforma). */
export async function findCatalogWork(source: "anidb" | "kitsu", sourceId: number) {
  const entry = await prisma.catalogEntry.findUnique({ where: source === "anidb" ? { anidbId: sourceId } : { kitsuId: sourceId } });
  return entry?.onPlatform ? entry : null;
}

/** `/anime/anidb-<id>` e `/anime/kitsu-<id>`: quem já acompanha a obra vai para a própria página dela (como na AniList). */
export async function PublicCatalogWork({ source, sourceId }: { source: "anidb" | "kitsu"; sourceId: number }) {
  const entry = await findCatalogWork(source, sourceId);
  if (!entry) notFound();
  if (entry.anilistId !== null) permanentRedirect(`/anime/${entry.anilistId}`);
  const user = await getCurrentUser();
  const owned = user ? await prisma.anime.findUnique({ where: { userId_catalogEntryId: { userId: user.id, catalogEntryId: entry.id } }, select: { id: true } }) : null;
  if (owned) redirect(`/anime/${owned.id}`);
  return <CatalogWork entry={entry} signedIn={Boolean(user)} userId={user?.id ?? null} />;
}

/** O item da lista de quem abre a página (só na página da própria pessoa). */
export type OwnedCatalogItem = { id: string; accentColor?: string | null; isFavorite: boolean; watchState: string | null; waiting: boolean; userScore: number | null; titleRomaji: string; titleEnglish: string | null; platformLinks: PlatformLink[] };

/**
 * Página de uma obra sem AniList ID (só do AniDB ou da Kitsu): ficha, sinopse, episódios (só o dia — o AniDB não informa
 * horário) e extras. Dá para acompanhar, marcar o andamento e dar nota, e a comunidade (discussões, comentários de quem
 * acompanha e quiz) vai pela obra do catálogo. Relacionadas dependem da AniList e não aparecem. Sem horário, a obra não
 * entra no calendário nem nos avisos. Quando é ligada à AniList, o endereço público passa a levar à página dela — e a
 * comunidade vai junto.
 */
export async function CatalogWork({ entry, signedIn, userId, owned = null }: { entry: CatalogEntry; signedIn: boolean; userId: string | null; owned?: OwnedCatalogItem | null }) {
  const work = catalogSlug(entry) ?? "";
  const ref = { anilistId: null, catalogEntryId: entry.id } as const;

  const [schedule, extras] = await Promise.all([loadCatalogEpisodes(entry.id), loadExtras({ catalogEntryId: entry.id })]);
  const genres = entry.genres ? entry.genres.split(",").filter(Boolean) : [];
  const titlePrimary = entry.titleNative ?? entry.titleRomaji;
  const facts = workFacts(entry, null);
  const badges = workBadges({ kind: entry.kind, ...facts });

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <WorkHero bannerImage={entry.bannerImage} coverImage={entry.coverImage}>
        <Box sx={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 2 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            <AppLink href="/discover" underline="hover" color="inherit">
              EXPLORAR
            </AppLink>{" "}
            / <span lang={entry.titleNative ? "ja" : undefined}>{titlePrimary}</span>
          </Typography>
          <Box>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Typography component="h1" data-testid="anime-title" variant="h3" className="font-display" sx={{ textTransform: "uppercase", lineHeight: 1, fontSize: { xs: "2.25rem", sm: "3rem" }, overflowWrap: "anywhere" }}>
                <AnimeTitle titles={{ titleRomaji: entry.titleRomaji, titleEnglish: entry.titleEnglish, titleNative: entry.titleNative }} />
              </Typography>
              <SiteScoreChip score={entry.siteScore ?? 5} votes={entry.siteScoreVotes ?? 0} />
              {owned && <FavoriteToggle animeId={owned.id} initialFavorite={owned.isFavorite} />}
            </Stack>
            {entry.titleNative && (
              <Typography className="font-jp" variant="h6" sx={{ mt: 0.5, color: "text.secondary" }}>
                {entry.titleNative}
              </Typography>
            )}
            {entry.titleEnglish && entry.titleEnglish !== entry.titleRomaji && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {entry.titleEnglish}
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
          {signedIn ? (
            <SeasonControls anilistId={null} work={work} seasonNumber={1} mine={owned ? { animeId: owned.id, watchState: owned.watchState, waiting: owned.waiting, userScore: owned.userScore } : null} />
          ) : (
            <Box>
              <LinkButton href={`/login?next=${encodeURIComponent(`/anime/${work}`)}`} variant="contained" data-testid="follow-login-button">
                Entre para acompanhar
              </LinkButton>
            </Box>
          )}
          <Typography data-testid="catalog-work-follow-note" sx={{ fontSize: 14, color: "text.secondary", borderLeft: 3, borderColor: "secondary.main", pl: 1.5, maxWidth: 560 }}>
            Esta obra só tem o dia de cada episódio, sem horário: ela não entra no calendário nem nos avisos.
          </Typography>
        </Box>
      </WorkHero>

      <WorkSectionNav
        sections={[
          { id: "visao-geral", label: "Visão geral" },
          { id: "episodios", label: "Episódios" },
          { id: "comunidade", label: "Comunidade" },
        ]}
      />

      <Box sx={{ mt: 4, px: { xs: 3, sm: 5 }, display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) minmax(0,360px)" }, columnGap: 5, rowGap: 4, alignItems: "start" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <Box component="section" id="visao-geral" aria-labelledby="sinopse-heading" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
            <Typography id="sinopse-heading" component="h2" sx={headingSx}>
              Sinopse
            </Typography>
            <SynopsisText description={entry.description} stored={{ pt: entry.descriptionPt, ja: entry.descriptionJa }} sx={{ fontSize: 16 }} />
          </Box>

          <Box id="episodios" sx={{ display: "flex", flexDirection: "column", gap: 2, scrollMarginTop: 150 }}>
            <Typography component="h2" sx={headingSx}>
              Episódios
            </Typography>
            {schedule.length > 0 ? (
              <ScheduleEpisodeList episodes={asScheduledEpisodes(schedule, new Map())} />
            ) : (
              <Typography data-testid="catalog-work-no-episodes" sx={{ fontSize: 14, color: "text.secondary" }}>
                Os episódios desta obra ainda não foram cadastrados.
              </Typography>
            )}
            <WorkExtras extras={extras} />
          </Box>
        </Box>

        <Box component="aside" aria-label="Informações da obra" sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <WorkCard title="Ficha" testId="work-card-info">
            <WorkInfoList
              rows={[
                ["Tipo", typeLabel({ kind: entry.kind, format: facts.format })],
                ["Situação", statusLabel(facts.status)],
                ["Época", seasonLabel(facts)],
                ["Episódios", episodesLabel(facts.episodes)],
                [
                  "Site oficial",
                  entry.officialSite ? (
                    <AppLink key="site" href={entry.officialSite} target="_blank" rel="noopener noreferrer" underline="hover" data-testid="official-site">
                      Abrir ↗
                    </AppLink>
                  ) : null,
                ],
              ]}
            />
          </WorkCard>
          {owned && (
            <WorkCard title="Onde eu assisto" testId="my-watch-source">
              <PlatformLinksManager animeId={owned.id} initialLinks={owned.platformLinks} />
            </WorkCard>
          )}
          <WorkQuizEntry work={ref} workKey={work} userId={userId} />
          {owned && (
            <Box>
              <UnfollowButton animeId={owned.id} title={owned.titleEnglish ?? owned.titleRomaji} />
            </Box>
          )}
        </Box>
      </Box>

      <Box id="comunidade" sx={{ mt: 6, px: { xs: 3, sm: 5 }, display: "flex", flexDirection: "column", gap: 5, scrollMarginTop: 150 }}>
        {owned && (
          <Box component="section" aria-labelledby="comentarios-heading" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography id="comentarios-heading" component="h2" sx={headingSx}>
              Comentários
            </Typography>
            <CommentSection animeId={owned.id} accentColor={owned.accentColor ?? null} />
          </Box>
        )}
        <WorkDiscussions work={ref} workKey={work} titleNative={entry.titleNative} titleRomaji={entry.titleRomaji} titleEnglish={entry.titleEnglish} seasonNumber={null} loggedIn={signedIn} />
      </Box>
    </div>
  );
}
