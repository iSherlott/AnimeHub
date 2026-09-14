import Image from "next/image";
import { notFound } from "next/navigation";
import { Box, Chip, Stack, Typography } from "@mui/material";
import LanguageIcon from "@mui/icons-material/Language";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { Header } from "@/components/Header";
import { ProgressEditor } from "@/components/ProgressEditor";
import { PlatformLinksManager } from "@/components/PlatformLinksManager";
import { EpisodeGrid } from "@/components/EpisodeGrid";
import { SeasonSwitcher } from "@/components/SeasonSwitcher";
import { SeriesGroupEditor } from "@/components/SeriesGroupEditor";
import { AnimeTitle } from "@/components/AnimeTitle";
import { TitleEditor } from "@/components/TitleEditor";
import { RefreshDataButton } from "@/components/RefreshDataButton";
import { AnidbIdEditor } from "@/components/AnidbIdEditor";
import { OtherTitles } from "@/components/OtherTitles";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { CommentSection } from "@/components/CommentSection";
import { CastSection } from "@/components/CastSection";
import { TrailerEmbed } from "@/components/TrailerEmbed";
import { Row } from "@/components/Row";
import { RecommendationCard, type RecommendationData } from "@/components/RecommendationCard";
import { ensureEpisodes, type EpisodesResult } from "@/lib/episodes";
import { ensureTitleFurigana } from "@/lib/ensureFurigana";
import { callInternalService } from "@/lib/serviceDelegate";
import type { WatchStatus } from "@/lib/types";
import type { AniListCharacterEntry, AniListRecommendation } from "@/lib/anilist";

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    include: { platformLinks: true, progress: true },
  });

  if (!anime || anime.userId !== user.id) notFound();

  const genres = anime.genres ? anime.genres.split(",").filter(Boolean) : [];
  const cast: AniListCharacterEntry[] = anime.castJson ? JSON.parse(anime.castJson) : [];
  const rawRecommendations: AniListRecommendation[] = anime.recommendationsJson
    ? JSON.parse(anime.recommendationsJson)
    : [];

  const [seasons, episodesResult, furiganaHtml, ownedRecommendedAnime] = await Promise.all([
    anime.seriesKey
      ? prisma.anime.findMany({
          where: { seriesKey: anime.seriesKey, userId: user.id },
          orderBy: { seasonNumber: "asc" },
          select: { id: true, seasonNumber: true, titleRomaji: true },
        })
      : Promise.resolve([]),
    // Nota: quando delegado, episodesResult.episodes[].airDate volta como
    // string ISO (round-trip por JSON), não Date — diferente do caminho
    // local. EpisodeGrid não usa airDate hoje, então é inofensivo, mas
    // qualquer novo uso desse campo precisa tratar os dois formatos.
    callInternalService<EpisodesResult>(process.env.CACHE_UPDATER_URL, "/ensure-episodes", {
      animeId: anime.id,
    }).then((delegated) => delegated ?? ensureEpisodes(anime)),
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
  ]);

  const animeIdByAnilistId = new Map(ownedRecommendedAnime.map((a) => [a.anilistId, a.id]));
  const recommendations: RecommendationData[] = rawRecommendations.map((rec) => {
    const ownAnimeId = animeIdByAnilistId.get(rec.anilistId);
    return {
      ...rec,
      isInternal: Boolean(ownAnimeId),
      href: ownAnimeId ? `/anime/${ownAnimeId}` : `https://anilist.co/anime/${rec.anilistId}`,
    };
  });

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <Box sx={{ position: "relative", height: { xs: 256, sm: 320 }, width: "100%", overflow: "hidden" }}>
        {anime.bannerImage ? (
          <Image
            src={anime.bannerImage}
            alt=""
            fill
            style={{ objectFit: "cover", opacity: 0.4 }}
          />
        ) : (
          <Box sx={{ height: "100%", width: "100%", bgcolor: "background.paper" }} />
        )}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: anime.accentColor
              ? `linear-gradient(to top, #0b0b0d, ${anime.accentColor}66, transparent)`
              : "linear-gradient(to top, #0b0b0d, rgba(11,11,13,0.4), transparent)",
          }}
        />
      </Box>

      <Box sx={{ position: "relative", zIndex: 1, mt: -12, display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 3, px: { xs: 3, sm: 5 } }}>
        <Box
          sx={{
            position: "relative",
            mt: -1,
            height: { xs: 224, sm: 288 },
            width: { xs: 160, sm: 192 },
            flexShrink: 0,
            overflow: "hidden",
            border: 2,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {anime.coverImage ? (
            <Image src={anime.coverImage} alt="" fill style={{ objectFit: "cover" }} />
          ) : null}
        </Box>

        <Box sx={{ display: "flex", flex: 1, flexDirection: "column", gap: 3 }}>
          <Box>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Typography
                component="h1"
                data-testid="anime-title"
                variant="h3"
                className="font-display"
                sx={{ textTransform: "uppercase", lineHeight: 1 }}
              >
                <AnimeTitle
                  titles={{
                    titleRomaji: anime.titleRomaji,
                    titleEnglish: anime.titleEnglish,
                    titleNative: anime.titleNative,
                    titlePortuguese: anime.titlePortuguese,
                  }}
                  furiganaHtml={furiganaHtml}
                />
              </Typography>
              {anime.anidbRating ? (
                <Chip
                  label={`AniDB ${anime.anidbRating.toFixed(1)}`}
                  title={`Nota da AniDB${anime.anidbVotes ? ` — ${anime.anidbVotes} votos` : ""}`}
                  size="small"
                  sx={{ bgcolor: "secondary.main", color: "#0b0b0d", fontWeight: 700 }}
                />
              ) : anime.averageScore ? (
                <Chip
                  label={`AniList ${(anime.averageScore / 10).toFixed(1)}`}
                  title="Nota média da comunidade AniList"
                  size="small"
                  sx={{ bgcolor: "secondary.main", color: "#0b0b0d", fontWeight: 700 }}
                />
              ) : null}
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
            <Box sx={{ mt: 0.5 }}>
              <OtherTitles titlesJson={anime.anidbTitles} />
            </Box>
          </Box>

          <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
            <SeasonSwitcher currentId={anime.id} seasons={seasons} />
            <SeriesGroupEditor
              animeId={anime.id}
              seriesKey={anime.seriesKey ?? anime.titleRomaji.toLowerCase()}
              seasonNumber={anime.seasonNumber}
            />
            <TitleEditor animeId={anime.id} titlePortuguese={anime.titlePortuguese} />
            <AnidbIdEditor animeId={anime.id} anidbId={anime.anidbId} />
            <RefreshDataButton animeId={anime.id} />
            {anime.lastRefreshedAt && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Atualizado em {anime.lastRefreshedAt.toLocaleDateString("pt-BR")}
              </Typography>
            )}
          </Stack>

          {(genres.length > 0 || anime.officialSite) && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              {genres.map((g) => (
                <Chip key={g} label={g} size="small" sx={{ fontWeight: 700, textTransform: "uppercase" }} />
              ))}
              {anime.officialSite && (
                <Chip
                  component="a"
                  href={anime.officialSite}
                  target="_blank"
                  rel="noopener noreferrer"
                  clickable
                  // O prop `icon` do Chip some da 1ª renderização do servidor
                  // (fica só depois da hidratação) quando combinado com
                  // clickable+component="a" — causa um mismatch de
                  // hidratação real. Compor o ícone dentro do label evita o
                  // caminho de clonagem de ícone do Chip que tem o bug.
                  label={
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <LanguageIcon fontSize="small" />
                      <span>Site oficial</span>
                    </Stack>
                  }
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
          )}

          {anime.description && (
            <Typography
              variant="body2"
              sx={{ maxWidth: 672, lineHeight: 1.7, color: "text.secondary" }}
              dangerouslySetInnerHTML={{ __html: anime.description }}
            />
          )}

          {(anime.anidbAwards || anime.anidbResources) && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, borderLeft: 2, borderColor: "secondary.main", bgcolor: "background.paper", p: 2 }}>
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                Dados da AniDB
              </Typography>
              {anime.anidbAwards && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  🏆 {anime.anidbAwards.split(",").filter(Boolean).join(" · ")}
                </Typography>
              )}
              {anime.anidbResources && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  {Object.entries(JSON.parse(anime.anidbResources) as Record<string, string>).map(
                    ([label, url]) => (
                      <Chip
                        key={label}
                        component="a"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        clickable
                        label={`${label} ↗`}
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: "uppercase" }}
                      />
                    )
                  )}
                </Stack>
              )}
            </Box>
          )}

          <ProgressEditor
            animeId={anime.id}
            episodes={anime.episodes}
            initialStatus={(anime.progress?.status as WatchStatus) ?? "PLAN_TO_WATCH"}
            initialEpisodeProgress={anime.progress?.episodeProgress ?? 0}
            initialScore={anime.progress?.score ?? null}
          />

          <Box>
            <Typography variant="body2" className="font-display" sx={{ mb: 1, textTransform: "uppercase", color: "text.secondary" }}>
              Onde assistir
            </Typography>
            <PlatformLinksManager
              animeId={anime.id}
              initialLinks={anime.platformLinks}
            />
          </Box>
        </Box>
      </Box>

      {anime.trailerSite?.toLowerCase() === "youtube" && anime.trailerId && (
        <Box sx={{ mt: 4, px: { xs: 3, sm: 5 } }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
            <Box sx={{ width: 6, height: 16, bgcolor: "primary.main", transform: "skewX(-12deg)" }} />
            <Typography variant="h6" component="h2" sx={{ textTransform: "uppercase" }}>
              Trailer
            </Typography>
          </Stack>
          <TrailerEmbed id={anime.trailerId} />
        </Box>
      )}

      {cast.length > 0 && (
        <Box sx={{ mt: 4, px: { xs: 3, sm: 5 } }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
            <Box sx={{ width: 6, height: 16, bgcolor: "primary.main", transform: "skewX(-12deg)" }} />
            <Typography variant="h6" component="h2" sx={{ textTransform: "uppercase" }}>
              Elenco
            </Typography>
          </Stack>
          <CastSection cast={cast} />
        </Box>
      )}

      <Box sx={{ mt: 4, px: { xs: 3, sm: 5 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
          <Box sx={{ width: 6, height: 16, bgcolor: "primary.main", transform: "skewX(-12deg)" }} />
          <Typography variant="h6" component="h2" sx={{ textTransform: "uppercase" }}>
            Episódios
          </Typography>
        </Stack>
        {episodesResult.episodes.length > 0 ? (
          <EpisodeGrid
            episodes={episodesResult.episodes}
            fallbackImage={anime.coverImage}
            watchedCount={anime.progress?.episodeProgress}
          />
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {episodesResult.error
              ? `Não foi possível carregar os episódios (${episodesResult.error}).`
              : "Nenhum episódio encontrado para este anime."}
          </Typography>
        )}
      </Box>

      <Box sx={{ mt: 4, px: { xs: 3, sm: 5 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
          <Box sx={{ width: 6, height: 16, bgcolor: "primary.main", transform: "skewX(-12deg)" }} />
          <Typography variant="h6" component="h2" sx={{ textTransform: "uppercase" }}>
            Comentários
          </Typography>
        </Stack>
        <CommentSection animeId={anime.id} />
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
