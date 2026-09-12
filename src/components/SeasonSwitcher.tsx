import Link from "next/link";

export type SeasonEntry = {
  id: string;
  seasonNumber: number;
  titleRomaji: string;
};

export function SeasonSwitcher({
  currentId,
  seasons,
}: {
  currentId: string;
  seasons: SeasonEntry[];
}) {
  if (seasons.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {seasons.map((s) => (
        <Link
          key={s.id}
          href={`/anime/${s.id}`}
          className={`jump-badge px-3 py-1.5 font-display text-xs uppercase tracking-wide transition ${
            s.id === currentId
              ? "bg-jump-red text-text-primary"
              : "bg-surface-raised text-text-muted hover:bg-surface"
          }`}
        >
          Temporada {s.seasonNumber}
        </Link>
      ))}
    </div>
  );
}
