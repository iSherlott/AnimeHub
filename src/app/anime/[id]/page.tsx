import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
import { ensureEpisodes } from "@/lib/episodes";
import { ensureTitleFurigana } from "@/lib/ensureFurigana";
import type { WatchStatus } from "@/lib/types";

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    include: { platformLinks: true, progress: true },
  });

  if (!anime) notFound();

  const genres = anime.genres ? anime.genres.split(",").filter(Boolean) : [];

  const [seasons, episodesResult, furiganaHtml] = await Promise.all([
    anime.seriesKey
      ? prisma.anime.findMany({
          where: { seriesKey: anime.seriesKey },
          orderBy: { seasonNumber: "asc" },
          select: { id: true, seasonNumber: true, titleRomaji: true },
        })
      : Promise.resolve([]),
    ensureEpisodes(anime),
    ensureTitleFurigana(anime),
  ]);

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <div className="relative h-64 w-full overflow-hidden sm:h-80">
        {anime.bannerImage ? (
          <Image
            src={anime.bannerImage}
            alt={anime.titleRomaji}
            fill
            className="object-cover opacity-40"
          />
        ) : (
          <div className="jump-halftone h-full w-full bg-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      </div>

      <div className="relative z-10 -mt-24 flex flex-col gap-6 px-6 sm:flex-row sm:px-10">
        <div className="jump-corner jump-shadow-lg relative -mt-4 h-56 w-40 flex-shrink-0 overflow-hidden border-2 border-border-strong sm:h-72 sm:w-48">
          {anime.coverImage ? (
            <Image
              src={anime.coverImage}
              alt={anime.titleRomaji}
              fill
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1
                data-testid="anime-title"
                className="font-display text-3xl uppercase leading-none text-text-primary drop-shadow-[2px_2px_0_#000] sm:text-4xl"
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
              </h1>
              {anime.anidbRating ? (
                <span
                  className="jump-badge flex items-center gap-1 bg-jump-yellow px-2 py-1 text-xs font-bold text-ink"
                  title={`Nota da AniDB${anime.anidbVotes ? ` — ${anime.anidbVotes} votos` : ""}`}
                >
                  AniDB {anime.anidbRating.toFixed(1)}
                </span>
              ) : anime.averageScore ? (
                <span
                  className="jump-badge flex items-center gap-1 bg-jump-yellow px-2 py-1 text-xs font-bold text-ink"
                  title="Nota média da comunidade AniList"
                >
                  AniList {(anime.averageScore / 10).toFixed(1)}
                </span>
              ) : null}
            </div>
            {anime.titleNative && (
              <p className="font-jp mt-1 text-lg text-text-muted">
                {anime.titleNative}
              </p>
            )}
            {anime.titleEnglish && anime.titleEnglish !== anime.titleRomaji && (
              <p className="text-sm text-text-muted">{anime.titleEnglish}</p>
            )}
            <div className="mt-1">
              <OtherTitles titlesJson={anime.anidbTitles} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
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
              <p className="text-[10px] text-text-muted">
                Atualizado em {anime.lastRefreshedAt.toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>

          {genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <span
                  key={g}
                  className="jump-badge bg-surface-raised px-3 py-1 text-xs font-bold uppercase tracking-wide text-text-body"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {anime.description && (
            <p
              className="max-w-2xl text-sm leading-relaxed text-text-body"
              dangerouslySetInnerHTML={{ __html: anime.description }}
            />
          )}

          {(anime.anidbAwards || anime.anidbResources) && (
            <div className="flex flex-col gap-2 border-l-2 border-jump-yellow bg-surface p-3 text-sm">
              <p className="font-display text-[10px] uppercase tracking-wide text-text-muted">
                Dados da AniDB
              </p>
              {anime.anidbAwards && (
                <p className="text-text-body">
                  🏆 {anime.anidbAwards.split(",").filter(Boolean).join(" · ")}
                </p>
              )}
              {anime.anidbResources && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(JSON.parse(anime.anidbResources) as Record<string, string>).map(
                    ([label, url]) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="jump-badge border border-border bg-surface-raised px-2 py-1 text-xs uppercase text-text-muted hover:border-jump-red hover:text-text-body"
                      >
                        {label} ↗
                      </a>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          <ProgressEditor
            animeId={anime.id}
            episodes={anime.episodes}
            initialStatus={(anime.progress?.status as WatchStatus) ?? "PLAN_TO_WATCH"}
            initialEpisodeProgress={anime.progress?.episodeProgress ?? 0}
            initialScore={anime.progress?.score ?? null}
          />

          <div>
            <h2 className="font-display mb-2 text-sm uppercase tracking-wide text-text-body">
              Onde assistir
            </h2>
            <PlatformLinksManager
              animeId={anime.id}
              initialLinks={anime.platformLinks}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 px-6 sm:px-10">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1.5 -skew-x-12 bg-jump-red" />
          <h2 className="font-display text-lg uppercase tracking-wide text-text-primary">
            Episódios
          </h2>
        </div>
        {episodesResult.episodes.length > 0 ? (
          <EpisodeGrid episodes={episodesResult.episodes} />
        ) : (
          <p className="text-sm text-text-muted">
            {episodesResult.error
              ? `Não foi possível carregar os episódios (${episodesResult.error}).`
              : "Nenhum episódio encontrado para este anime."}
          </p>
        )}
      </div>
    </div>
  );
}
