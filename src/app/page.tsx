import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Row } from "@/components/Row";
import { AnimeCard } from "@/components/AnimeCard";
import { HeroBanner } from "@/components/HeroBanner";
import { ensureTitleFurigana } from "@/lib/ensureFurigana";
import { WATCH_STATUS_LABELS, type WatchStatus } from "@/lib/types";

const STATUS_ROWS: { status: WatchStatus; title: string }[] = [
  { status: "WATCHING", title: "Continuar assistindo" },
  { status: "PLAN_TO_WATCH", title: WATCH_STATUS_LABELS.PLAN_TO_WATCH },
  { status: "COMPLETED", title: WATCH_STATUS_LABELS.COMPLETED },
  { status: "PAUSED", title: WATCH_STATUS_LABELS.PAUSED },
  { status: "DROPPED", title: WATCH_STATUS_LABELS.DROPPED },
];

export default async function Home() {
  const animes = await prisma.anime.findMany({
    include: { platformLinks: true, progress: true },
    orderBy: { createdAt: "desc" },
  });

  if (animes.length === 0) {
    return (
      <div className="jump-halftone min-h-screen bg-ink">
        <Header />
        <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
          <p className="font-display -rotate-2 text-2xl uppercase text-text-primary drop-shadow-[3px_3px_0_#000]">
            Sua lista ainda está vazia!
          </p>
          <Link
            href="/discover"
            className="jump-shadow border-2 border-border-strong bg-jump-red px-5 py-2 font-display text-sm uppercase tracking-wide text-text-primary transition hover:bg-jump-red-bright"
          >
            Descobrir animes
          </Link>
        </div>
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

  const featuredPrimaryLink = featured.platformLinks[0] ?? null;
  const featuredFurigana = await ensureTitleFurigana(featured);

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <HeroBanner
        id={featured.id}
        titleRomaji={featured.titleRomaji}
        titleEnglish={featured.titleEnglish}
        titleNative={featured.titleNative}
        titlePortuguese={featured.titlePortuguese}
        titleFurigana={featuredFurigana}
        description={featured.description}
        bannerImage={featured.bannerImage}
        coverImage={featured.coverImage}
        genres={featured.genres ? featured.genres.split(",").filter(Boolean) : []}
        primaryLink={
          featuredPrimaryLink
            ? { platform: featuredPrimaryLink.platform, url: featuredPrimaryLink.url }
            : null
        }
      />

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
