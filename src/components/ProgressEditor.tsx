"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  function setStar(value: number) {
    const next = score === value ? null : value; // clicar na mesma estrela limpa a nota
    setScore(next);
    update({ score: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border border-border bg-surface p-4">
      <select
        value={status}
        disabled={saving}
        onChange={(e) => {
          const value = e.target.value as WatchStatus;
          setStatus(value);
          update({ status: value });
        }}
        className="border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary"
      >
        {WATCH_STATUSES.map((s) => (
          <option key={s} value={s}>
            {WATCH_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2 text-sm text-text-body">
        <button
          onClick={() => changeEpisode(-1)}
          disabled={saving || episodeProgress <= 0}
          className="h-8 w-8 border border-border bg-surface-raised font-bold text-text-primary disabled:opacity-40"
        >
          −
        </button>
        <span>
          Episódio {episodeProgress}
          {episodes ? ` / ${episodes}` : ""}
        </span>
        <button
          onClick={() => changeEpisode(1)}
          disabled={saving || (episodes != null && episodeProgress >= episodes)}
          className="h-8 w-8 border border-border bg-surface-raised font-bold text-text-primary disabled:opacity-40"
        >
          +
        </button>
      </div>

      <div className="flex items-center gap-1" title="Sua nota (clique de novo pra limpar)">
        {[2, 4, 6, 8, 10].map((value) => (
          <button
            key={value}
            onClick={() => setStar(value)}
            disabled={saving}
            className={`text-xl leading-none transition ${
              score !== null && score >= value
                ? "text-jump-yellow"
                : "text-text-muted hover:text-jump-yellow/60"
            }`}
          >
            ★
          </button>
        ))}
        {score !== null && (
          <span className="ml-1 text-xs text-text-muted">{score}/10</span>
        )}
      </div>
    </div>
  );
}
