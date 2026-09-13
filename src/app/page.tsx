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

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="min-h-screen bg-ink">
        <Header />
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, px: 3, py: 12, textAlign: "center" }}>
          <Typography variant="h4" component="p" sx={{ textTransform: "uppercase" }}>
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
      </div>
    );
  }

  const animes = await prisma.anime.findMany({
    where: { userId: user.id },
    include: { platformLinks: true, progress: true },
    orderBy: { createdAt: "desc" },
  });

  if (animes.length === 0) {
    return (
      <div className="min-h-screen bg-ink">
        <Header />
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, px: 3, py: 12, textAlign: "center" }}>
          <Typography variant="h4" component="p" sx={{ textTransform: "uppercase" }}>
            Sua lista ainda está vazia!
          </Typography>
          <LinkButton href="/discover" variant="contained" sx={{ mt: 1 }}>
            Descobrir animes
          </LinkButton>
        </Box>
      </div>
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

  // O hero gira entre os favoritos (curadoria manual, ver FavoriteToggle) —
  // sem nenhum favorito ainda, cai pro pick único de sempre (só não gira).
  const favoriteAnimes = animes
    .filter((a) => a.isFavorite)
    .sort((a, b) => (b.favoritedAt?.getTime() ?? 0) - (a.favoritedAt?.getTime() ?? 0))
    .slice(0, 6);
  const heroSourceAnimes = favoriteAnimes.length > 0 ? favoriteAnimes : [featured];

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
            />
          ))}
        </Row>
      </div>
    </div>
  );
}
