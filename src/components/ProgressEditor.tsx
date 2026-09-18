"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { Box, Chip, IconButton, Rating, Typography } from "@mui/material";
import type { WatchStatus } from "@/lib/types";

export function ProgressEditor({
  animeId,
  episodes,
  initialStatus,
  initialEpisodeProgress,
  initialScore,
  accentColor,
}: {
  animeId: string;
  episodes: number | null;
  initialStatus: WatchStatus;
  initialEpisodeProgress: number;
  initialScore: number | null;
  /** Cor de destaque do anime (ver Anime.accentColor) — usada no botão de
   * "Finalizado" e nas estrelas de nota quando disponível, com fallback pro
   * tema padrão. */
  accentColor?: string | null;
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

  // Único jeito de setar status pela UI agora (ver decisão do lote 1 no
  // plano) — WATCHING é inferido no servidor a partir do primeiro bump de
  // episódio (ver PATCH /api/anime/[id]/progress), então aqui só alterna
  // COMPLETED "on"/"off". Desmarcar volta pro que fizer sentido pelo
  // progresso atual: WATCHING se já tem episódio contado, senão
  // PLAN_TO_WATCH.
  function toggleFinished() {
    if (status === "COMPLETED") {
      const next: WatchStatus = episodeProgress > 0 ? "WATCHING" : "PLAN_TO_WATCH";
      setStatus(next);
      update({ status: next });
      return;
    }
    // Marcar como finalizado sem also levar o contador de episódio até o
    // fim deixava a página contradizendo a si mesma — "Finalizado" no
    // topo, mas o accordion de episódios logo abaixo ainda mostrando a
    // maioria como não assistida (achado real da 24ª rodada de auditoria,
    // Epic 18). Só ajusta quando o total de episódios é conhecido e o
    // progresso atual ainda não chegou lá — nunca diminui.
    const data: Partial<{ status: WatchStatus; episodeProgress: number }> = { status: "COMPLETED" };
    setStatus("COMPLETED");
    if (episodes != null && episodeProgress < episodes) {
      setEpisodeProgress(episodes);
      data.episodeProgress = episodes;
    }
    update(data);
  }

  function handleRatingChange(newValue: number | null) {
    const next = newValue === null ? null : newValue * 2;
    setScore(next);
    update({ score: next });
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 3, border: 1, borderColor: "divider", bgcolor: "background.paper", p: 2 }}>
      <Chip
        onClick={toggleFinished}
        disabled={saving}
        icon={status === "COMPLETED" ? <CheckCircleIcon /> : <CheckCircleOutlineIcon />}
        label={status === "COMPLETED" ? "Finalizado" : "Marcar como finalizado"}
        size="small"
        variant={status === "COMPLETED" ? "filled" : "outlined"}
        sx={
          status === "COMPLETED"
            ? { bgcolor: accentColor ?? "success.main", color: "#0b0b0d", "& .MuiChip-icon": { color: "#0b0b0d" } }
            : undefined
        }
      />

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
          sx={accentColor ? { color: accentColor } : undefined}
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
