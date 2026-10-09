"use client";

import { useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { CalendarEntryCard } from "@/components/CalendarEntryCard";
import type { CalendarItem } from "@/lib/calendarItem";

const OTHERS_PREVIEW_COUNT = 4;


export function CalendarDayColumn({
  day,
  items,
  showAll,
  isToday,
  timeZone,
}: {
  day: Date;
  items: CalendarItem[];
  showAll: boolean;
  isToday: boolean;
  /** Fuso em que o dia foi montado (instante 00:00 nesse fuso). */
  timeZone: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const mine = items.filter((item) => item.inMyList);
  const others = showAll ? items.filter((item) => !item.inMyList) : [];
  const visibleOthers = expanded ? others : others.slice(0, OTHERS_PREVIEW_COUNT);
  const hiddenCount = others.length - visibleOthers.length;
  const totalCount = mine.length + others.length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "baseline",
          borderBottom: 2,
          borderColor: isToday ? "primary.main" : "divider",
          pb: 1,
        }}
      >
        <Typography variant="body2" className="font-display" sx={{ textTransform: "uppercase", color: isToday ? "primary.main" : "text.secondary" }}>
          {new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(day).replace(".", "").toUpperCase()}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit" }).format(day)}
        </Typography>
      </Stack>

      {mine.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {mine.map((item) => (
            <CalendarEntryCard key={item.key} item={item} />
          ))}
        </Box>
      ) : !showAll ? (
        <Box sx={{ border: 1, borderStyle: "dashed", borderColor: "divider", bgcolor: "background.paper", px: 1, py: 2 }}>
          <Typography variant="caption" sx={{ display: "block", textAlign: "center", lineHeight: 1.6, color: "text.secondary" }}>
            Nada da sua lista
            <br />
            por aqui
          </Typography>
        </Box>
      ) : null}

      {showAll && others.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {mine.length > 0 && (
            <Typography variant="caption" className="font-display" sx={{ mt: 0.5, textTransform: "uppercase", color: "text.secondary" }}>
              Outros lançamentos
            </Typography>
          )}
          {visibleOthers.map((item) => (
            <CalendarEntryCard key={item.key} item={item} />
          ))}
          {hiddenCount > 0 && (
            <Button
              onClick={() => setExpanded(true)}
              size="small"
              sx={{ justifyContent: "flex-start", px: 0, minWidth: 0, fontSize: 10, color: "text.secondary" }}
            >
              + {hiddenCount} mais
            </Button>
          )}
          {expanded && others.length > OTHERS_PREVIEW_COUNT && (
            <Button
              onClick={() => setExpanded(false)}
              size="small"
              sx={{ justifyContent: "flex-start", px: 0, minWidth: 0, fontSize: 10, color: "text.secondary" }}
            >
              Mostrar menos
            </Button>
          )}
        </Box>
      )}

      {showAll && totalCount === 0 && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Nada previsto
        </Typography>
      )}
    </Box>
  );
}
