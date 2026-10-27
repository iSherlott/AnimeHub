"use client";

import { Box, Typography } from "@mui/material";
import { CalendarEntryCard } from "@/components/CalendarEntryCard";
import type { CalendarItem } from "@/lib/calendarItem";

/**
 * Uma coluna de dia da agenda semanal (Figma `8:2106`): cabeçalho de 56 px com
 * "SEG" + número (hoje: fundo avermelhado e "HOJE" em acento) e a lista de
 * lançamentos do dia em ordem de horário. Não existe eixo de horas — o que
 * não tem horário confiável fica fora da grade (painéis abaixo).
 */
export function CalendarDayColumn({
  day,
  items,
  isToday,
  timeZone,
  onFollowed,
  onPendingChange,
  onUnfollowed,
  onResumed,
  highlightMine,
}: {
  day: Date;
  items: CalendarItem[];
  isToday: boolean;
  /** Fuso em que o dia foi montado (instante 00:00 nesse fuso). */
  timeZone: string;
  onFollowed?: (anilistId: number, animeId: string) => void;
  onPendingChange?: (anilistId: number, postponed: boolean) => void;
  onUnfollowed?: (anilistId: number) => void;
  onResumed?: (anilistId: number) => void;
  highlightMine?: boolean;
}) {
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(day).replace(".", "").toUpperCase();
  const dayOfMonth = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" }).format(day);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }} data-testid={`calendar-day-${weekday}`} data-today={isToday ? "true" : undefined}>
      <Box
        sx={{
          height: "4em",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // Alinhado pelo topo: o "HOJE" a mais não desloca o dia e o número da coluna de hoje em relação às outras.
          justifyContent: "flex-start",
          pt: "0.45em",
          gap: "0.143em",
          bgcolor: isToday ? "#2c111b" : "background.paper",
        }}
      >
        <Typography component="span" sx={{ fontSize: "0.714em", fontWeight: 700, lineHeight: 1.2, color: "text.secondary" }}>
          {weekday}
        </Typography>
        <Typography component="span" sx={{ fontSize: "1.429em", fontWeight: 700, lineHeight: 1.2 }}>
          {dayOfMonth}
        </Typography>
        {isToday && (
          <Typography component="span" sx={{ fontSize: "0.643em", fontWeight: 700, lineHeight: 1.2, color: "primary.main" }}>
            HOJE
          </Typography>
        )}
      </Box>
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, flex: 1, display: "flex", flexDirection: "column", gap: "1px", bgcolor: "background.paper" }}>
        {items.map((item) => (
          <li key={item.key}>
            <CalendarEntryCard item={item} onFollowed={onFollowed} onPendingChange={onPendingChange} onUnfollowed={onUnfollowed} onResumed={onResumed} highlightMine={highlightMine} />
          </li>
        ))}
      </Box>
    </Box>
  );
}
