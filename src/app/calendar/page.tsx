"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { CalendarDayColumn } from "@/components/CalendarDayColumn";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { CalendarItem } from "@/lib/calendarItem";

const MAX_WEEK_OFFSET = 8;

/**
 * Semana fixa de calendário (Dom→Sáb), ancorada no domingo da semana atual
 * — não uma janela rolante de "hoje + 6 dias", que mudaria de recorte
 * dependendo do dia em que a página fosse aberta.
 */
function buildWeekDays(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(sunday.getDate() - sunday.getDay() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const user = useCurrentUser();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAll, setShowAllRaw] = useState(false);
  const userTouchedToggle = useRef(false);

  function setShowAll(value: boolean) {
    userTouchedToggle.current = true;
    setShowAllRaw(value);
  }

  useEffect(() => {
    // Sem login não existe "minha lista" pra mostrar — evita a tela ficar
    // sempre vazia por padrão pra quem não está logado. Se a pessoa já
    // mexeu no toggle manualmente, não sobrescreve a escolha dela.
    if (userTouchedToggle.current) return;
    if (user === null) setShowAllRaw(true);
  }, [user]);

  const weekDays = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const todayKey = useMemo(() => new Date().toDateString(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // O início da semana (domingo 00:00 no fuso do navegador) é enviado como
    // timestamp absoluto — o servidor não deve recalcular "hoje" com o
    // próprio relógio, porque server e navegador podem estar em fusos
    // diferentes e discordar sobre qual semana é a atual.
    const weekStart = Math.floor(weekDays[0].getTime() / 1000);
    fetch(`/api/calendar?weekOffset=${weekOffset}&weekStart=${weekStart}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Falha ao carregar o calendário");
          return;
        }
        setItems(data.results ?? []);
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
  }, [weekOffset, weekDays]);

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

  const myListCountThisWeek = useMemo(
    () => items.filter((item) => item.inMyList).length,
    [items]
  );

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <div className="jump-halftone border-b border-border px-6 py-8 sm:px-10">
        <h1 className="font-display text-3xl uppercase tracking-wide text-text-primary drop-shadow-[3px_3px_0_#000] sm:text-4xl">
          Calendário
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {myListCountThisWeek > 0
            ? `${myListCountThisWeek} lançamento${myListCountThisWeek > 1 ? "s" : ""} da sua lista nesta semana.`
            : "Episódios com data e horário de exibição confirmados."}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => Math.max(-MAX_WEEK_OFFSET, w - 1))}
              disabled={weekOffset <= -MAX_WEEK_OFFSET || loading}
              className="jump-badge border border-border bg-surface px-3 py-1.5 text-xs font-bold uppercase text-text-body transition hover:border-jump-red disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Semana anterior
            </button>
            <span className="font-display min-w-24 text-center text-sm uppercase text-text-muted">
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

          <div className="ml-0 flex border-2 border-border-strong sm:ml-auto">
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className={`jump-badge px-3 py-1.5 text-xs font-bold uppercase transition ${
                !showAll
                  ? "bg-jump-yellow text-ink"
                  : "bg-surface text-text-muted hover:text-text-body"
              }`}
            >
              ★ Minha lista
            </button>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={`px-3 py-1.5 text-xs font-bold uppercase transition ${
                showAll
                  ? "bg-jump-yellow text-ink"
                  : "bg-surface text-text-muted hover:text-text-body"
              }`}
            >
              Todos os lançamentos
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 sm:px-10">
        {loading ? (
          <p className="text-sm text-text-muted">Carregando calendário...</p>
        ) : error ? (
          <p className="text-sm text-jump-red-bright">{error}</p>
        ) : (
          <div
            key={`${weekOffset}-${showAll}`}
            className="animate-fade-in grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-7"
          >
            {weekDays.map((day, i) => (
              <CalendarDayColumn
                key={day.toISOString()}
                day={day}
                items={itemsByDay[i]}
                showAll={showAll}
                isToday={day.toDateString() === todayKey}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
