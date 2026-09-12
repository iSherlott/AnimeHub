"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { CalendarEntryCard } from "@/components/CalendarEntryCard";
import type { CalendarItem } from "@/lib/calendarItem";

const DAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MAX_WEEK_OFFSET = 8;

function buildWeekDays(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  today.setDate(today.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/calendar?weekOffset=${weekOffset}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Falha ao carregar o calendário");
          return;
        }
        setItems(data.results ?? []);
        setCached(Boolean(data.cached));
      })
      .catch(() => {
        if (!cancelled) setError("Falha ao carregar o calendário");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekOffset]);

  const weekRangeLabel = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekDays]);

  const itemsByDay = useMemo(() => {
    return weekDays.map((day) => {
      const dayKey = day.toDateString();
      return items
        .filter((item) => new Date(item.airingAt).toDateString() === dayKey)
        .sort((a, b) => new Date(a.airingAt).getTime() - new Date(b.airingAt).getTime());
    });
  }, [items, weekDays]);

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <div className="jump-halftone border-b border-border px-6 py-8 sm:px-10">
        <h1 className="font-display text-3xl uppercase tracking-wide text-text-primary drop-shadow-[3px_3px_0_#000] sm:text-4xl">
          Calendário
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Episódios com data e horário de exibição confirmados.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.max(-MAX_WEEK_OFFSET, w - 1))}
            disabled={weekOffset <= -MAX_WEEK_OFFSET || loading}
            className="jump-badge border border-border bg-surface px-3 py-1.5 text-xs font-bold uppercase text-text-body transition hover:border-jump-red disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Semana anterior
          </button>
          <span className="font-display text-sm uppercase text-text-muted">
            {weekOffset === 0 ? "Esta semana" : weekRangeLabel}
          </span>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(MAX_WEEK_OFFSET, w + 1))}
            disabled={weekOffset >= MAX_WEEK_OFFSET || loading}
            className="jump-badge border border-border bg-surface px-3 py-1.5 text-xs font-bold uppercase text-text-body transition hover:border-jump-red disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima semana →
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-xs text-text-muted underline-offset-2 hover:text-text-body hover:underline"
            >
              Voltar para hoje
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-6 sm:px-10">
        {loading ? (
          <p className="text-sm text-text-muted">Carregando calendário...</p>
        ) : error ? (
          <p className="text-sm text-jump-red-bright">{error}</p>
        ) : (
          <>
            {cached && (
              <p className="mb-4 text-xs text-cache">
                AniList fora do ar — mostrando o calendário salvo localmente.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
              {weekDays.map((day, i) => {
                const isToday = weekOffset === 0 && i === 0;
                return (
                  <div key={day.toISOString()} className="flex flex-col gap-2">
                    <div
                      className={`flex items-center gap-2 border-b-2 pb-2 ${
                        isToday ? "border-jump-red" : "border-border"
                      }`}
                    >
                      <span
                        className={`font-display text-sm uppercase ${
                          isToday ? "text-jump-red" : "text-text-body"
                        }`}
                      >
                        {DAY_LABELS[day.getDay()]}
                      </span>
                      <span className="text-xs text-text-muted">
                        {day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {itemsByDay[i].length === 0 ? (
                        <p className="text-xs text-text-muted">Nada previsto</p>
                      ) : (
                        itemsByDay[i].map((item) => (
                          <CalendarEntryCard key={item.key} item={item} cached={cached} />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
