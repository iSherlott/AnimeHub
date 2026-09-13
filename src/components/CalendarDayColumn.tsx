"use client";

import { useState } from "react";
import { CalendarEntryCard } from "@/components/CalendarEntryCard";
import type { CalendarItem } from "@/lib/calendarItem";

const OTHERS_PREVIEW_COUNT = 4;

const DAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export function CalendarDayColumn({
  day,
  items,
  showAll,
  isToday,
}: {
  day: Date;
  items: CalendarItem[];
  showAll: boolean;
  isToday: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const mine = items.filter((item) => item.inMyList);
  const others = showAll ? items.filter((item) => !item.inMyList) : [];
  const visibleOthers = expanded ? others : others.slice(0, OTHERS_PREVIEW_COUNT);
  const hiddenCount = others.length - visibleOthers.length;
  const totalCount = mine.length + others.length;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`flex items-baseline gap-2 border-b-2 pb-2 ${
          isToday ? "border-jump-red" : "border-border"
        }`}
      >
        <span
          className={`font-display text-base uppercase ${
            isToday ? "text-jump-red" : "text-text-body"
          }`}
        >
          {DAY_LABELS[day.getDay()]}
        </span>
        <span className="text-xs text-text-muted">
          {day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </span>
      </div>

      {mine.length > 0 ? (
        <div className="flex flex-col gap-2">
          {mine.map((item) => (
            <CalendarEntryCard key={item.key} item={item} variant="featured" />
          ))}
        </div>
      ) : !showAll ? (
        <p className="jump-halftone border border-dashed border-border bg-surface/40 px-2 py-4 text-center text-[11px] leading-relaxed text-text-muted">
          Nada da sua lista
          <br />
          por aqui
        </p>
      ) : null}

      {showAll && others.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {mine.length > 0 && (
            <p className="font-display mt-1 text-[10px] uppercase tracking-wide text-text-muted">
              Outros lançamentos
            </p>
          )}
          {visibleOthers.map((item) => (
            <CalendarEntryCard key={item.key} item={item} variant="compact" />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-left text-[10px] text-text-muted underline-offset-2 hover:text-text-body hover:underline"
            >
              + {hiddenCount} mais
            </button>
          )}
          {expanded && others.length > OTHERS_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-left text-[10px] text-text-muted underline-offset-2 hover:text-text-body hover:underline"
            >
              Mostrar menos
            </button>
          )}
        </div>
      )}

      {showAll && totalCount === 0 && (
        <p className="text-xs text-text-muted">Nada previsto</p>
      )}
    </div>
  );
}
