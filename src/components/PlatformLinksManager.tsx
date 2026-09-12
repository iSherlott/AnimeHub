"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KNOWN_PLATFORMS } from "@/lib/types";

type Link = { id: string; platform: string; url: string };

export function PlatformLinksManager({
  animeId,
  initialLinks,
}: {
  animeId: string;
  initialLinks: Link[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [platform, setPlatform] = useState<string>(KNOWN_PLATFORMS[0]);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function addLink() {
    if (!url.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/anime/${animeId}/platform-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, url: url.trim() }),
      });
      setUrl("");
      setFormOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(linkId: string) {
    await fetch(`/api/anime/${animeId}/platform-links?linkId=${linkId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  return (
    <div className="space-y-3" data-testid="platform-links">
      <div className="flex flex-wrap items-center gap-2">
        {initialLinks.map((link) => (
          <div
            key={link.id}
            data-testid={`platform-link-${link.platform}`}
            className="jump-badge flex items-center gap-2 bg-jump-red py-1 pl-3 pr-1 text-sm"
          >
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`platform-link-open-${link.platform}`}
              className="font-display uppercase tracking-wide text-text-primary hover:underline"
            >
              Assistir na {link.platform}
            </a>
            <button
              onClick={() => removeLink(link.id)}
              data-testid={`platform-link-remove-${link.platform}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-text-primary/80 hover:bg-black/30 hover:text-text-primary"
              title="Remover link"
            >
              ×
            </button>
          </div>
        ))}

        {initialLinks.length === 0 && (
          <p className="text-sm text-text-muted">
            Nenhuma plataforma vinculada ainda.
          </p>
        )}

        {!formOpen && (
          <button
            onClick={() => setFormOpen(true)}
            data-testid="platform-link-add-toggle"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-lg font-bold text-text-body transition hover:border-jump-red hover:text-jump-red"
            title="Vincular plataforma"
          >
            +
          </button>
        )}
      </div>

      {formOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            data-testid="platform-select"
            className="border border-border bg-surface-raised px-2 py-1.5 text-sm text-text-primary"
          >
            {KNOWN_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            data-testid="platform-url-input"
            autoFocus
            className="w-64 border border-border bg-surface-raised px-2 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
          />
          <button
            onClick={addLink}
            disabled={saving}
            data-testid="platform-link-submit"
            className="border border-border-strong bg-surface-raised px-3 py-1.5 font-display text-sm uppercase tracking-wide text-text-primary hover:bg-surface disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Vincular"}
          </button>
          <button
            onClick={() => setFormOpen(false)}
            className="text-xs text-text-muted hover:text-text-body"
          >
            cancelar
          </button>
        </div>
      )}
    </div>
  );
}
