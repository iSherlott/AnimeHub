"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SOURCE_LABELS: Record<string, string> = {
  anilist: "AniList",
  kitsu: "Kitsu",
  jikan: "Jikan (MAL)",
  shikimori: "Shikimori",
  anidb: "AniDB",
};

export function RefreshDataButton({ animeId }: { animeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);

  async function refresh() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/anime/${animeId}/refresh`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setResult(data.status);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={refresh}
        disabled={loading}
        className="jump-badge flex w-fit items-center gap-1.5 border border-border bg-surface px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-text-body transition hover:border-jump-red disabled:opacity-50"
        title="Busca dados atualizados na AniList, Kitsu, Jikan (MyAnimeList), Shikimori e AniDB (se configurada)"
      >
        <span className={loading ? "animate-spin" : ""}>⟳</span>
        {loading ? "Atualizando..." : "Atualizar dados"}
      </button>
      {result && (
        <p className="text-[10px] text-text-muted">
          {Object.entries(result)
            .map(([source, s]) => `${SOURCE_LABELS[source] ?? source}: ${s}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
