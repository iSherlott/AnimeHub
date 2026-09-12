"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnidbIdEditor({
  animeId,
  anidbId,
}: {
  animeId: string;
  anidbId: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(anidbId?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/anime/${animeId}/anidb`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anidbId: value.trim() ? Number(value.trim()) : null }),
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
        {anidbId ? `AniDB #${anidbId} · editar` : "Vincular ID da AniDB"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border border-border bg-surface p-2 text-xs">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ID numérico (ex: 15617)"
        className="w-40 border border-border bg-surface-raised px-2 py-1 text-text-primary placeholder:text-text-muted"
      />
      <a
        href="https://anidb.net/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-jump-red hover:text-jump-red-bright"
      >
        buscar no site ↗
      </a>
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
