"use client";

import Image from "next/image";
import Link from "next/link";
import type { CalendarItem } from "@/lib/calendarItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

type CalendarEntryCardProps = {
  item: CalendarItem;
  cached: boolean;
  variant?: "featured" | "compact";
};

export function CalendarEntryCard({ item, cached, variant = "compact" }: CalendarEntryCardProps) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const time = new Date(item.airingAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isInternal = item.inMyList && item.animeId;
  const linkProps = isInternal
    ? { href: `/anime/${item.animeId}` }
    : {
        href: `https://anilist.co/anime/${item.anilistId}`,
        target: "_blank",
        rel: "noopener noreferrer",
      };

  if (variant === "featured") {
    return (
      <Link
        {...linkProps}
        className="group jump-corner jump-shadow relative block overflow-hidden border-2 border-border bg-surface transition-all duration-150 ease-out hover:-translate-y-1 hover:border-jump-yellow hover:jump-shadow-lg"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-raised">
          {item.coverImage ? (
            <Image
              src={item.coverImage}
              alt={title}
              fill
              sizes="(min-width: 1024px) 140px, 45vw"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-text-muted">
              {title}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
          <span
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-jump-yellow"
            title="Já está na sua lista"
          >
            ★
          </span>
          <div className="absolute inset-x-0 bottom-0 p-1.5">
            <p className="font-display line-clamp-2 text-[11px] uppercase leading-tight text-text-primary">
              {title}
            </p>
            <p className="mt-0.5 text-[10px] font-bold text-jump-yellow">
              EP {item.episode} · {time}
              {cached && <span className="ml-1 font-normal text-cache">· cache</span>}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      {...linkProps}
      className={`group flex items-center gap-2 border-l-2 bg-surface p-1.5 transition hover:border-jump-red hover:bg-surface-raised ${
        item.inMyList ? "border-jump-yellow" : "border-border"
      }`}
    >
      <div className="relative h-11 w-8 flex-shrink-0 overflow-hidden bg-surface-raised">
        {item.coverImage ? (
          <Image src={item.coverImage} alt={title} fill sizes="32px" className="object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[10px] leading-tight text-text-muted">
          {title}
        </p>
        <p className="mt-0.5 text-[10px] text-text-muted">
          EP {item.episode} · {time}
          {cached && <span className="ml-1 text-cache">· cache</span>}
        </p>
      </div>
    </Link>
  );
}
