import Image from "next/image";
import Link from "next/link";
import { AnimeTitle } from "@/components/AnimeTitle";

export type HeroBannerData = {
  id: string;
  titleRomaji: string;
  titleEnglish?: string | null;
  titleNative: string | null;
  titlePortuguese?: string | null;
  titleFurigana?: string | null;
  description: string | null;
  bannerImage: string | null;
  coverImage: string | null;
  genres: string[];
  primaryLink?: { platform: string; url: string } | null;
};

export function HeroBanner({
  id,
  titleRomaji,
  titleEnglish,
  titleNative,
  titlePortuguese,
  titleFurigana,
  description,
  bannerImage,
  coverImage,
  genres,
  primaryLink,
}: HeroBannerData) {
  const backdrop = bannerImage ?? coverImage;

  return (
    <section className="relative flex h-[52vh] min-h-[360px] w-full items-end overflow-hidden sm:h-[62vh]">
      {backdrop ? (
        <Image
          src={backdrop}
          alt=""
          fill
          priority
          className="object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-jump-red/40 via-ink to-ink" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-transparent" />
      <div className="jump-speedlines absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/20 to-transparent" />

      <div className="relative z-10 max-w-2xl px-6 pb-10 sm:px-10 sm:pb-14">
        {titleNative && (
          <p className="font-jp mb-1 text-sm font-medium text-text-muted">
            {titleNative}
          </p>
        )}
        <h1 className="font-display text-4xl uppercase leading-none text-text-primary drop-shadow-[3px_3px_0_#000] sm:text-6xl">
          <AnimeTitle
            titles={{ titleRomaji, titleEnglish, titleNative, titlePortuguese }}
            furiganaHtml={titleFurigana}
          />
        </h1>

        {genres.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="jump-badge bg-surface-raised/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-text-primary backdrop-blur-sm"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {description && (
          <p
            className="mt-4 line-clamp-3 text-sm text-text-body sm:text-base"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        <div className="mt-6 flex flex-wrap gap-4">
          {primaryLink ? (
            <a
              href={primaryLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="jump-shadow flex items-center gap-2 border-2 border-border-strong bg-jump-red px-5 py-2.5 font-display text-sm uppercase tracking-wide text-text-primary transition-transform hover:-translate-y-0.5 hover:bg-jump-red-bright active:translate-y-0"
            >
              ▶ Assistir na {primaryLink.platform}
            </a>
          ) : (
            <Link
              href={`/anime/${id}`}
              className="jump-shadow flex items-center gap-2 border-2 border-border-strong bg-jump-red px-5 py-2.5 font-display text-sm uppercase tracking-wide text-text-primary transition-transform hover:-translate-y-0.5 hover:bg-jump-red-bright"
            >
              ▶ Vincular plataforma
            </Link>
          )}
          <Link
            href={`/anime/${id}`}
            className="flex items-center gap-2 border-2 border-border bg-ink/60 px-5 py-2.5 font-display text-sm uppercase tracking-wide text-text-primary backdrop-blur-sm transition hover:border-text-primary"
          >
            ⓘ Mais informações
          </Link>
        </div>
      </div>
    </section>
  );
}
