import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Row } from "@/components/Row";
import { AnimeCard } from "@/components/AnimeCard";
import { HeroBannerRotator } from "@/components/HeroBannerRotator";
import type { HeroBannerData } from "@/components/HeroBanner";
import { LinkButton } from "@/components/LinkButton";
import { ensureTitleFurigana } from "@/lib/ensureFurigana";
import { getCurrentUser } from "@/lib/auth/session";
import { WATCH_STATUS_LABELS, type WatchStatus } from "@/lib/types";

const STATUS_ROWS: { status: WatchStatus; title: string }[] = [
  { status: "WATCHING", title: "Continuar assistindo" },
  { status: "PLAN_TO_WATCH", title: WATCH_STATUS_LABELS.PLAN_TO_WATCH },
  { status: "COMPLETED", title: WATCH_STATUS_LABELS.COMPLETED },
  { status: "PAUSED", title: WATCH_STATUS_LABELS.PAUSED },
  { status: "DROPPED", title: WATCH_STATUS_LABELS.DROPPED },
];

export default async function MinhaListaPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Faça login para ver sua lista
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 448, color: "text.secondary" }}>
            Descobrir e o calendário de lançamentos continuam livres pra
            navegar sem conta — só a sua lista pessoal precisa de login.
          </Typography>
          <LinkButton href="/login" variant="contained" sx={{ mt: 1 }}>
            Entrar
          </LinkButton>
        </Box>
      </Box>
    );
  }

  const animes = await prisma.anime.findMany({
    where: { userId: user.id },
    include: { platformLinks: true, progress: true },
    orderBy: { createdAt: "desc" },
  });

  if (animes.length === 0) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
        <Header />
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, px: 3, py: 8, textAlign: "center" }}>
          <Typography variant="h4" component="h1" sx={{ textTransform: "uppercase" }}>
            Sua lista ainda está vazia!
          </Typography>
          <LinkButton href="/discover" variant="contained" sx={{ mt: 1 }}>
            Descobrir animes
          </LinkButton>
        </Box>
      </Box>
    );
  }

  const byStatus = (status: WatchStatus) =>
    animes
      .filter((a) => a.progress?.status === status)
      .sort(
        (a, b) =>
          (b.progress?.updatedAt.getTime() ?? 0) -
          (a.progress?.updatedAt.getTime() ?? 0)
      );

  const featured =
    byStatus("WATCHING")[0] ??
    animes.find((a) => a.bannerImage || a.coverImage) ??
    animes[0];

  // O hero prioriza os favoritos (curadoria manual, ver FavoriteToggle),
  // mas gira entre pelo menos 3 animes da lista quando existirem (Epic 16)
  // — não só entre favoritos. Com poucos (ou nenhum) favorito, completa a
  // rotação com o resto da lista: o pick único de sempre primeiro, depois
  // o restante priorizando quem tem imagem — sempre banner/capa já
  // licenciados via AniList/Kitsu (Anime.bannerImage/coverImage já
  // persistidos), nunca uma imagem de terceiros buscada à parte.
  const favoriteAnimes = animes
    .filter((a) => a.isFavorite)
    .sort((a, b) => (b.favoritedAt?.getTime() ?? 0) - (a.favoritedAt?.getTime() ?? 0))
    .slice(0, 6);
  const favoriteIds = new Set(favoriteAnimes.map((a) => a.id));
  const rest = animes
    .filter((a) => !favoriteIds.has(a.id))
    .sort((a, b) => {
      if (a.id === featured.id) return -1;
      if (b.id === featured.id) return 1;
      const aHasImage = a.bannerImage || a.coverImage ? 1 : 0;
      const bHasImage = b.bannerImage || b.coverImage ? 1 : 0;
      return bHasImage - aHasImage;
    });
  const heroSourceAnimes = [...favoriteAnimes, ...rest].slice(0, 6);

  const heroItems: HeroBannerData[] = await Promise.all(
    heroSourceAnimes.map(async (anime) => {
      const primaryLink = anime.platformLinks[0] ?? null;
      const furiganaHtml = await ensureTitleFurigana(anime);
      return {
        id: anime.id,
        titleRomaji: anime.titleRomaji,
        titleEnglish: anime.titleEnglish,
        titleNative: anime.titleNative,
        titlePortuguese: anime.titlePortuguese,
        titleFurigana: furiganaHtml,
        description: anime.description,
        bannerImage: anime.bannerImage,
        coverImage: anime.coverImage,
        accentColor: anime.accentColor,
        genres: anime.genres ? anime.genres.split(",").filter(Boolean) : [],
        primaryLink: primaryLink ? { platform: primaryLink.platform, url: primaryLink.url } : null,
      };
    })
  );

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <HeroBannerRotator items={heroItems} />

      <div className="flex flex-col gap-2">
        {STATUS_ROWS.map(({ status, title }) => {
          const items = byStatus(status);
          if (items.length === 0) return null;
          return (
            <Row key={status} title={title}>
              {items.map((anime) => (
                <AnimeCard
                  key={anime.id}
                  id={anime.id}
                  href={`/anime/${anime.id}`}
                  titles={{
                    titleRomaji: anime.titleRomaji,
                    titleEnglish: anime.titleEnglish,
                    titleNative: anime.titleNative,
                    titlePortuguese: anime.titlePortuguese,
                  }}
                  coverImage={anime.coverImage}
                  episodes={anime.episodes}
                  status={anime.progress?.status as WatchStatus | undefined}
                  episodeProgress={anime.progress?.episodeProgress}
                  isFavorite={anime.isFavorite}
                />
              ))}
            </Row>
          );
        })}

        <Row title="Todos os animes">
          {animes.map((anime) => (
            <AnimeCard
              key={anime.id}
              id={anime.id}
              href={`/anime/${anime.id}`}
              titles={{
                titleRomaji: anime.titleRomaji,
                titleEnglish: anime.titleEnglish,
                titleNative: anime.titleNative,
                titlePortuguese: anime.titlePortuguese,
              }}
              coverImage={anime.coverImage}
              episodes={anime.episodes}
              status={anime.progress?.status as WatchStatus | undefined}
              episodeProgress={anime.progress?.episodeProgress}
              isFavorite={anime.isFavorite}
            />
          ))}
        </Row>
      </div>
    </div>
  );
}
