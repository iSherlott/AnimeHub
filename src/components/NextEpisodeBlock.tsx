"use client";

import { Box, Typography } from "@mui/material";
import { formatTimeInZone, timeZoneLabel, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

/**
 * "PRÓXIMO EPISÓDIO" do hero da obra (Figma `13:42435`): dia da semana e
 * horário no fuso efetivo, número do episódio, "HOJE · 10 OUT" quando é hoje
 * e o fuso explícito (CAL-002). Sem previsão confirmada, diz exatamente isso.
 */
export function NextEpisodeBlock({ iso, episode }: { iso: string | null; episode: number | null }) {
  const timeZone = useTimeZone();

  return (
    <Box
      data-testid="next-episode"
      sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Typography sx={{ fontSize: 18, lineHeight: 1.5 }}>PRÓXIMO EPISÓDIO</Typography>
      {iso && episode !== null ? (
        <NextEpisodeDetails iso={iso} episode={episode} timeZone={timeZone} />
      ) : (
        <Typography sx={{ color: "text.secondary" }}>Sem previsão confirmada.</Typography>
      )}
    </Box>
  );
}

function NextEpisodeDetails({ iso, episode, timeZone }: { iso: string; episode: number; timeZone: string }) {
  const date = new Date(iso);
  const weekday = weekdayName(date, timeZone);
  const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "short" }).format(date).replace(".", "").toUpperCase();
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const isToday = dayKey(date) === dayKey(new Date());

  return (
    <>
      <Typography suppressHydrationWarning sx={{ fontSize: 36, lineHeight: 1.2 }}>
        {weekday} · {formatTimeInZone(date, timeZone)}
      </Typography>
      <Typography suppressHydrationWarning sx={{ fontSize: 16, display: "flex", gap: 3, flexWrap: "wrap" }}>
        <span>Episódio {episode}</span>
        <span>
          {isToday ? "HOJE · " : ""}
          {dayMonth}
        </span>
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{timeZoneLabel(timeZone, true)}</Typography>
    </>
  );
}
