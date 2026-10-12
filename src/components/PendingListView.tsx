"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CheckIcon from "@mui/icons-material/Check";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { ListRow } from "@/components/ListRow";
import type { PendingEntryDTO } from "@/lib/pending";
import { formatTimeInZone, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

const pad = (n: number) => String(n).padStart(2, "0");

/** "Já saiu até o EP03 · esta semana" / "Próximo: EP04 · qui 12:00" / "Finalizado". */
function progressText(entry: PendingEntryDTO, timeZone: string): string {
  const parts: string[] = [];
  if (entry.latestAired !== null) {
    parts.push(`Já saiu até o EP${pad(entry.latestAired)}${entry.latestAiredThisWeek ? " · esta semana" : ""}`);
  }
  if (entry.next) {
    const at = new Date(entry.next.at);
    parts.push(`Próximo: EP${pad(entry.next.episode)} · ${weekdayName(at, timeZone)} ${formatTimeInZone(at, timeZone)}`);
  } else if (!entry.stillAiring) {
    parts.push("Finalizado");
  }
  return parts.join(" · ");
}

function PendingActions({ entry }: { entry: PendingEntryDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Onde assistir: o link que a pessoa cadastrou na obra; sem ele, o detalhe da obra na lista.
  const watch = entry.watchLinks[0];

  async function resolve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pending/${entry.anilistId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Não foi possível salvar. Tente novamente.");
        return;
      }
      router.refresh();
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "stretch" }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "flex-end" }}>
        {watch ? (
          <Button component="a" href={watch.url} target="_blank" rel="noopener noreferrer" startIcon={<PlayArrowIcon />} sx={ELEVATED_BUTTON_SX} data-testid="pending-watch">
            Assistir
          </Button>
        ) : (
          <Button component="a" href={`/anime/${entry.animeId}`} sx={ELEVATED_BUTTON_SX} data-testid="pending-open">
            Ver obra
          </Button>
        )}
        <Button onClick={() => void resolve()} disabled={busy} startIcon={<CheckIcon />} sx={ELEVATED_BUTTON_SX} data-testid="pending-resolve">
          {busy ? "Salvando…" : "Marcar como assistido"}
        </Button>
      </Box>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/**
 * "Para assistir": as obras em que a pessoa adiou episódios. Cada linha diz onde parou ("Parei no EP02"),
 * até onde a obra já saiu e quantos episódios faltam ver. Lembrete pessoal — não há registro de episódios vistos.
 */
export function PendingListView({ entries }: { entries: PendingEntryDTO[] }) {
  const timeZone = useTimeZone();
  return (
    <Box component="ul" data-testid="pending-list" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 0, m: 0 }}>
      {entries.map((entry) => (
        <ListRow
          key={entry.anilistId}
          testId={`pending-row-${entry.anilistId}`}
          timeTestId="pending-from"
          href={`/anime/${entry.animeId}`}
          time={`Parei no EP${pad(entry.fromEpisode)}`}
          episodeLabel={progressText(entry, timeZone)}
          cover={entry.coverImage}
          titles={entry}
          highlighted={entry.behind > 1}
          badge={
            entry.behind > 0 ? (
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#171820", color: "warning.main" }} data-testid="pending-behind">
                <EventRepeatIcon sx={{ fontSize: 14 }} />
                <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: "inherit", whiteSpace: "nowrap" }}>
                  {entry.behind === 1 ? "1 episódio para ver" : `${entry.behind} episódios para ver`}
                </Typography>
              </Box>
            ) : undefined
          }
          trailing={<PendingActions entry={entry} />}
        />
      ))}
    </Box>
  );
}
