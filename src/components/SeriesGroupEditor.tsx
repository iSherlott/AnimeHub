"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SeriesGroupEditor({
  animeId,
  seriesKey,
  seasonNumber,
}: {
  animeId: string;
  seriesKey: string;
  seasonNumber: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(seriesKey);
  const [season, setSeason] = useState(seasonNumber);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/anime/${animeId}/series`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesKey: key, seasonNumber: season }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-text-muted underline-offset-2 hover:text-text-body hover:underline"
      >
        Editar agrupamento de temporada
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border border-border bg-surface p-2 text-xs">
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="chave da franquia (ex: jujutsu kaisen)"
        className="w-56 border border-border bg-surface-raised px-2 py-1 text-text-primary placeholder:text-text-muted"
      />
      <input
        type="number"
        min={1}
        value={season}
        onChange={(e) => setSeason(Number(e.target.value))}
        className="w-16 border border-border bg-surface-raised px-2 py-1 text-text-primary"
      />
      <button
        onClick={save}
        disabled={saving}
        className="border border-border-strong bg-surface-raised px-2.5 py-1 font-display uppercase tracking-wide text-text-primary hover:bg-surface disabled:opacity-50"
      >
        {saving ? "..." : "Salvar"}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-text-muted hover:text-text-body"
      >
        cancelar
      </button>
    </div>
  );
}
