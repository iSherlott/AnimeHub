"use client";

import { formatTimeInZone, timeZoneLabel } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

/**
 * Data/hora no fuso do usuário (preferência da conta ou America/Sao_Paulo —
 * D-07), com o fuso EXPLÍCITO no modo completo (CAL-002). `compact` mostra
 * só "sáb 13:00" (para cards).
 */
export function LocalDateTime({ iso, compact = false }: { iso: string; compact?: boolean }) {
  const timeZone = useTimeZone();
  const date = new Date(iso);
  const time = formatTimeInZone(date, timeZone);

  if (compact) {
    const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(date).replace(".", "");
    return (
      <span suppressHydrationWarning>
        {weekday} {time}
      </span>
    );
  }

  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "short" }).format(date);
  return (
    <span suppressHydrationWarning>
      {weekday} · {day} · {time}
      <span style={{ opacity: 0.7 }}> ({timeZoneLabel(timeZone)})</span>
    </span>
  );
}
