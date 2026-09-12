"use client";

import Image from "next/image";
import Link from "next/link";
import type { CalendarItem } from "@/lib/calendarItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

export function CalendarEntryCard({ item, cached }: { item: CalendarItem; cached: boolean }) {
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

  return (
    <Link
      {...linkProps}
      className={`group flex items-center gap-2 border-l-2 bg-surface p-1.5 transition hover:border-jump-red hover:bg-surface-raised ${
        item.inMyList ? "border-jump-yellow" : "border-border"
      }`}
    >
      <div className="relative h-14 w-10 flex-shrink-0 overflow-hidden bg-surface-raised">
        {item.coverImage ? (
          <Image src={item.coverImage} alt={title} fill sizes="40px" className="object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display line-clamp-2 text-[11px] uppercase leading-tight text-text-primary">
          {title}
        </p>
        <p className="mt-0.5 text-[10px] text-text-muted">
          EP {item.episode} · {time}
          {cached && <span className="ml-1 text-cache">· cache</span>}
        </p>
      </div>
      {item.inMyList && (
        <span className="flex-shrink-0 text-jump-yellow" title="Já está na sua lista">
          ★
        </span>
      )}
    </Link>
  );
}
