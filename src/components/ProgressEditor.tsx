"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, IconButton, MenuItem, Rating, Select, Typography, type SelectChangeEvent } from "@mui/material";
import { WATCH_STATUSES, WATCH_STATUS_LABELS, type WatchStatus } from "@/lib/types";

export function ProgressEditor({
  animeId,
  episodes,
  initialStatus,
  initialEpisodeProgress,
  initialScore,
}: {
  animeId: string;
  episodes: number | null;
  initialStatus: WatchStatus;
  initialEpisodeProgress: number;
  initialScore: number | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<WatchStatus>(initialStatus);
  const [episodeProgress, setEpisodeProgress] = useState(initialEpisodeProgress);
  const [score, setScore] = useState<number | null>(initialScore);
  const [saving, setSaving] = useState(false);

  async function update(
    next: Partial<{ status: WatchStatus; episodeProgress: number; score: number | null }>
  ) {
    setSaving(true);
    try {
      await fetch(`/api/anime/${animeId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function changeEpisode(delta: number) {
    const next = Math.max(0, Math.min(episodes ?? Infinity, episodeProgress + delta));
    setEpisodeProgress(next);
    update({ episodeProgress: next });
  }

  function handleStatusChange(e: SelectChangeEvent<WatchStatus>) {
    const value = e.target.value as WatchStatus;
    setStatus(value);
    update({ status: value });
  }

  function handleRatingChange(newValue: number | null) {
    const next = newValue === null ? null : newValue * 2;
    setScore(next);
    update({ score: next });
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 3, border: 1, borderColor: "divider", bgcolor: "background.paper", p: 2 }}>
      <Select value={status} disabled={saving} onChange={handleStatusChange} size="small">
        {WATCH_STATUSES.map((s) => (
          <MenuItem key={s} value={s}>
            {WATCH_STATUS_LABELS[s]}
          </MenuItem>
        ))}
      </Select>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton
          onClick={() => changeEpisode(-1)}
          disabled={saving || episodeProgress <= 0}
          size="small"
          aria-label="Diminuir episódio"
          sx={{ border: 1, borderColor: "divider" }}
        >
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2">
          Episódio {episodeProgress}
          {episodes ? ` / ${episodes}` : ""}
        </Typography>
        <IconButton
          onClick={() => changeEpisode(1)}
          disabled={saving || (episodes != null && episodeProgress >= episodes)}
          size="small"
          aria-label="Aumentar episódio"
          sx={{ border: 1, borderColor: "divider" }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }} title="Sua nota (clique de novo pra limpar)">
        <Rating
          value={score === null ? null : score / 2}
          max={5}
          onChange={(_, newValue) => handleRatingChange(newValue)}
          disabled={saving}
        />
        {score !== null && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {score}/10
          </Typography>
        )}
      </Box>
    </Box>
  );
}
