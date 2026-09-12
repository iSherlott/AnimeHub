"use client";

import Link from "next/link";
import Image from "next/image";
import {
  WATCH_STATUS_LABELS,
  WATCH_STATUS_BADGE_CLASSES,
  type WatchStatus,
} from "@/lib/types";
import { resolveTitleText, useTitlePreference, type TitleSet } from "@/lib/titlePreference";

export type AnimeCardData = {
  id: string | number;
  href: string;
  titles: TitleSet;
  coverImage: string | null;
  episodes?: number | null;
  status?: WatchStatus;
  episodeProgress?: number;
};

function ImpactBurst() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="absolute right-1.5 top-1.5 h-5 w-5 fill-jump-yellow opacity-0 drop-shadow-[1px_1px_0_#000] transition-opacity duration-150 group-hover:opacity-100"
      aria-hidden
    >
      <path d="M12 0l2.2 7.2L21 5l-4 6 7 1.5-7 1.5 4 6-6.8-2.2L12 24l-2.2-6.2L3 20l4-6-7-1.5L7 11 3 5l6.8 2.2z" />
    </svg>
  );
}

export function AnimeCard({
  id,
  href,
  titles,
  coverImage,
  episodes,
  status,
  episodeProgress,
}: AnimeCardData) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, titles);

  const progressPct =
    status === "WATCHING" && episodes && episodes > 0
      ? Math.min(100, ((episodeProgress ?? 0) / episodes) * 100)
      : null;

  return (
    <Link
      href={href}
      data-testid={`anime-card-${id}`}
      className="group relative w-36 flex-shrink-0 sm:w-44"
    >
      <div className="jump-corner jump-shadow relative border-2 border-border bg-surface transition-all duration-150 ease-out group-hover:z-20 group-hover:-translate-y-1 group-hover:border-jump-red group-hover:jump-shadow-lg">
        <div className="relative aspect-[2/3] w-full overflow-hidden">
          {coverImage ? (
            <Image
              src={coverImage}
              alt={title}
              fill
              sizes="192px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface to-surface-raised px-2 text-center text-[11px] text-text-muted">
              {title}
            </div>
          )}

          <ImpactBurst />

          {status && (
            <span
              className={`jump-badge absolute left-1.5 top-1.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${WATCH_STATUS_BADGE_CLASSES[status]}`}
            >
              {WATCH_STATUS_LABELS[status]}
            </span>
          )}

          {progressPct !== null && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
              <div
                className="h-full bg-jump-red"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-ink/90 p-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="font-display line-clamp-2 text-xs uppercase leading-tight text-text-primary">
              {title}
            </p>
            {episodes ? (
              <p className="mt-0.5 text-[10px] text-text-muted">
                {episodeProgress ?? 0}/{episodes} eps
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
