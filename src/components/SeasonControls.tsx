"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";
import { STATE_LABELS, WATCH_STATES } from "@/lib/watchCategory";

export type MySeason = { animeId: string; watchState: string | null; waiting: boolean };

/**
 * Andamento de UMA temporada da obra, na seção "Temporadas". Quem tem a temporada escolhe: acompanhando, terminei, não
 * terminei ou dropei (vi as anteriores e desisti daqui: sem avisos, fora do calendário, e as próximas temporadas não
 * entram sozinhas). Quem não tem pode marcá-la como já vista ou passar a acompanhá-la.
 */
export function SeasonControls({ anilistId, seasonNumber, mine }: { anilistId: number; seasonNumber: number; mine: MySeason | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(url: string, init: RequestInit): Promise<Response | null> {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível salvar. Tente novamente.");
      return null;
    }
    return res;
  }

  async function run(work: () => Promise<boolean>) {
    setBusy(true);
    setError(null);
    try {
      if (await work()) router.refresh();
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const setState = (animeId: string, state: string | null) => run(async () => (await request(`/api/anime/${animeId}/watch-state`, { method: "PATCH", body: JSON.stringify({ state }) })) !== null);

  const follow = (state: string | null) =>
    run(async () => {
      const created = await request("/api/anime", { method: "POST", body: JSON.stringify({ anilistId }) });
      if (!created) return false;
      if (!state) return true;
      const body = (await created.json()) as { anime?: { id?: string } };
      return body.anime?.id ? (await request(`/api/anime/${body.anime.id}/watch-state`, { method: "PATCH", body: JSON.stringify({ state }) })) !== null : true;
    });

  return (
    <Box data-testid={`season-controls-${anilistId}`} sx={{ display: "flex", flexDirection: "column", gap: 0.75, alignItems: "flex-start" }}>
      {mine ? (
        <Box
          component="select"
          aria-label={`Andamento da Temporada ${seasonNumber}`}
          data-testid={`season-state-${anilistId}`}
          value={mine.watchState ?? ""}
          disabled={busy}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => void setState(mine.animeId, event.target.value || null)}
          sx={{ px: 1, py: 0.6, borderRadius: "6px", border: 1, borderColor: "divider", bgcolor: "#171820", color: "text.primary", fontSize: 13, "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 } }}
        >
          <option value="">Andamento: automático</option>
          {WATCH_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]}
            </option>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" disabled={busy} onClick={() => void follow("FINISHED")} sx={ELEVATED_BUTTON_SX} data-testid={`season-seen-${anilistId}`}>
            Já vi esta temporada
          </Button>
          <Button size="small" disabled={busy} onClick={() => void follow(null)} sx={ELEVATED_BUTTON_SX} data-testid={`season-follow-${anilistId}`}>
            + Acompanhar
          </Button>
        </Box>
      )}
      {mine?.watchState === "DROPPED" && (
        <Typography data-testid={`season-dropped-note-${anilistId}`} sx={{ fontSize: 12, color: "text.secondary" }}>
          Fora do calendário e sem avisos. As próximas temporadas não entram na sua lista sozinhas.
        </Typography>
      )}
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
