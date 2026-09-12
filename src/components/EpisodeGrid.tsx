import Image from "next/image";
import type { Episode } from "@prisma/client";

function EpisodeTile({ ep }: { ep: Episode }) {
  const title = ep.titleRomaji ?? `Episódio ${ep.number}`;

  return (
    <div
      className="group overflow-hidden border border-border bg-surface transition-colors duration-150 hover:border-jump-red"
      title={ep.titleJapanese ? `${title} — ${ep.titleJapanese}` : title}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-surface-raised">
        {ep.thumbnail ? (
          <Image
            src={ep.thumbnail}
            alt={title}
            fill
            sizes="240px"
            className="object-cover"
          />
        ) : (
          <div className="font-display flex h-full w-full items-center justify-center text-2xl text-text-muted">
            {ep.number}
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 bg-ink/85 px-1.5 py-0.5 text-[10px] font-bold uppercase text-jump-red">
          EP {ep.number}
        </span>
      </div>
      <p className="truncate p-2 text-xs font-medium text-text-primary">{title}</p>
    </div>
  );
}

export function EpisodeGrid({ episodes }: { episodes: Episode[] }) {
  if (episodes.length === 0) return null;

  const seasonNumbers = Array.from(new Set(episodes.map((ep) => ep.seasonNumber))).sort(
    (a, b) => a - b
  );

  if (seasonNumbers.length <= 1) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {episodes.map((ep) => (
          <EpisodeTile key={ep.id} ep={ep} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {seasonNumbers.map((seasonNumber) => (
        <div key={seasonNumber}>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-3 w-1 -skew-x-12 bg-jump-red" />
            <h3 className="font-display text-sm uppercase tracking-wide text-text-body">
              Temporada {seasonNumber}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {episodes
              .filter((ep) => ep.seasonNumber === seasonNumber)
              .map((ep) => (
                <EpisodeTile key={ep.id} ep={ep} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
