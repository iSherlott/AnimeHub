"use client";

import { useState } from "react";
import { Box, Button, Chip, Link as MuiLink, Typography } from "@mui/material";
import { formatTimeInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";
import type { EventView } from "@/lib/animeEvents";

function when(startsAt: string, endsAt: string | null, timeZone: string): string {
  const fmt = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(d).replace(".", "");
  const start = new Date(startsAt);
  const base = `${fmt(start)} · ${formatTimeInZone(start, timeZone)}`;
  if (!endsAt) return base;
  const end = new Date(endsAt);
  return fmt(end) === fmt(start) ? `${base} às ${formatTimeInZone(end, timeZone)}` : `${base} até ${fmt(end)}`;
}

/** A agenda: cada evento com data, local, link, quem vai e o botão "Vou" (que liga o lembrete no sino no dia). */
export function EventsAgenda({ initial }: { initial: EventView[] }) {
  const timeZone = useTimeZone();
  const [events, setEvents] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(event: EventView) {
    setBusy(event.id);
    try {
      const res = await fetch(`/api/events/${event.id}/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ going: !event.mine }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEvents((list) => list.map((e) => (e.id === event.id ? { ...e, mine: !e.mine, going: data.going ?? e.going } : e)));
    } finally {
      setBusy(null);
    }
  }

  if (events.length === 0) {
    return <Typography sx={{ color: "text.secondary" }}>Nenhum evento na agenda por enquanto. A administração cadastra convenções, estreias no cinema e lives aqui.</Typography>;
  }

  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
      {events.map((e) => (
        <Box component="li" key={e.id} id={`evento-${e.id}`} data-testid="anime-event" sx={{ scrollMarginTop: 120, border: 1, borderColor: e.mine ? "primary.main" : "divider", borderRadius: "16px", bgcolor: "background.paper", p: 2.5, display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Chip size="small" label={e.kindLabel} />
            {e.partner && <Chip size="small" variant="outlined" label={`Parceria: ${e.partner}`} />}
          </Box>
          <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700, overflowWrap: "anywhere" }}>
            {e.title}
          </Typography>
          <Typography suppressHydrationWarning sx={{ fontSize: 14, color: "secondary.main", fontWeight: 700 }}>
            {when(e.startsAt, e.endsAt, timeZone)}
          </Typography>
          {e.place && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{e.place}</Typography>}
          {e.description && <Typography sx={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.description}</Typography>}
          {e.url && (
            <MuiLink href={e.url} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 14, alignSelf: "flex-start" }}>
              Site do evento ↗
            </MuiLink>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mt: 0.5 }}>
            <Button variant={e.mine ? "outlined" : "contained"} size="small" onClick={() => void toggle(e)} disabled={busy === e.id} data-testid="event-rsvp" aria-pressed={e.mine}>
              {e.mine ? "Vou ✓" : "Vou"}
            </Button>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }} data-testid="event-going">
              {e.going} {e.going === 1 ? "pessoa vai" : "pessoas vão"}
              {e.friendsGoing.length > 0 && ` · ${e.friendsGoing.slice(0, 3).join(", ")}${e.friendsGoing.length > 3 ? ` e mais ${e.friendsGoing.length - 3}` : ""}`}
            </Typography>
          </Box>
          {e.mine && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Você recebe um lembrete no sino no dia.</Typography>}
        </Box>
      ))}
    </Box>
  );
}
