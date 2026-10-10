"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { CalendarEntryCard } from "@/components/CalendarEntryCard";
import type { CalendarItem } from "@/lib/calendarItem";
import { HOURS_PER_DAY, layoutDayEvents, minutesFromClock } from "@/lib/calendarGrid";
import { formatTimeInZone } from "@/lib/timeZone";

/** Altura de um bloco em `em` (64 px com a base de 14 px do Figma). */
const BLOCK_HEIGHT_EM = 64 / 14;

/**
 * Uma coluna de dia da agenda semanal (Figma `8:2165`): cabeçalho "SEG 05"
 * (hoje: "HOJE" em acento sobre fundo avermelhado) e a faixa de 24 horas com
 * linhas de 2 em 2 horas. Cada lançamento é posicionado pelo horário local;
 * blocos que se tocam dividem a largura. `--hh` (altura da hora) vem da grade.
 */
export function CalendarDayColumn({
  day,
  items,
  isToday,
  timeZone,
}: {
  day: Date;
  items: CalendarItem[];
  isToday: boolean;
  /** Fuso em que o dia foi montado (instante 00:00 nesse fuso). */
  timeZone: string;
}) {
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(day).replace(".", "").toUpperCase();
  const dayOfMonth = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" }).format(day);

  const placed = useMemo(() => {
    const entries = items.map((item) => ({
      item,
      minutes: minutesFromClock(formatTimeInZone(new Date(item.airingAt), timeZone)),
    }));
    const layout = layoutDayEvents(entries.map((e) => e.minutes));
    return entries.map((e, i) => ({ ...e, ...layout[i] }));
  }, [items, timeZone]);

  // Linha do "agora" (só no dia de hoje); calculada no cliente, após montar.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (!isToday) return;
    const update = () => setNowMinutes(minutesFromClock(formatTimeInZone(new Date(), timeZone)));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [isToday, timeZone]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }} data-testid={`calendar-day-${weekday}`}>
      <Box
        sx={{
          height: "4.571em",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.286em",
          bgcolor: isToday ? "#2c111b" : "background.paper",
          borderTopLeftRadius: "0.857em",
          borderTopRightRadius: "0.857em",
        }}
      >
        <Typography sx={{ fontSize: "0.929em", fontWeight: 700, lineHeight: 1.5, whiteSpace: "nowrap" }}>
          {weekday} {dayOfMonth}
        </Typography>
        {isToday && (
          <Typography sx={{ fontSize: "0.714em", fontWeight: 700, lineHeight: 1.5, color: "primary.main" }}>HOJE</Typography>
        )}
      </Box>

      <Box
        sx={{
          position: "relative",
          height: `calc(${HOURS_PER_DAY} * var(--hh))`,
          bgcolor: isToday ? "#130d13" : "background.paper",
          border: 1,
          borderColor: "divider",
          // Linhas de 2 em 2 horas (uma a cada 2 * --hh).
          backgroundImage: "linear-gradient(to bottom, #272832 1px, transparent 1px)",
          backgroundSize: "100% calc(2 * var(--hh))",
        }}
      >
        {placed.map(({ item, minutes, lane, lanes }) => (
          <CalendarEntryCard
            key={item.key}
            item={item}
            style={{
              top: `calc(${minutes / 60} * var(--hh))`,
              height: `${BLOCK_HEIGHT_EM}em`,
              left: `calc(${(lane / lanes) * 100}% + 0.357em)`,
              width: `calc(${100 / lanes}% - 0.714em)`,
            }}
          />
        ))}

        {isToday && nowMinutes !== null && (
          <Box
            aria-hidden
            data-testid="calendar-now-line"
            sx={{ position: "absolute", left: 0, right: 0, height: "1px", bgcolor: "primary.main", pointerEvents: "none", zIndex: 1 }}
            style={{ top: `calc(${nowMinutes / 60} * var(--hh))` }}
          />
        )}
      </Box>
    </Box>
  );
}

