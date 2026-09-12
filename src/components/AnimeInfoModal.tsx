"use client";

import { useEffect } from "react";
import Image from "next/image";
import type { DiscoverItem } from "@/lib/discoverItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";

const STATUS_LABELS: Record<string, string> = {
  RELEASING: "Em exibição",
  FINISHED: "Finalizado",
  NOT_YET_RELEASED: "Não estreou",
  CANCELLED: "Cancelado",
  HIATUS: "Em hiato",
};

export function AnimeInfoModal({
  item,
  onClose,
}: {
  item: DiscoverItem;
  onClose: () => void;
}) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="jump-corner jump-shadow-lg relative max-h-[85vh] w-full max-w-2xl overflow-y-auto border-2 border-border-strong bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-lg text-text-primary transition hover:bg-jump-red"
          aria-label="Fechar"
        >
          ✕
        </button>

        {item.bannerImage ? (
          <div className="relative h-40 w-full overflow-hidden">
            <Image src={item.bannerImage} alt="" fill className="object-cover opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
          </div>
        ) : (
          <div className="h-16 w-full" />
        )}

        <div
          className={`flex gap-4 px-5 pb-4 ${item.bannerImage ? "-mt-12" : ""}`}
        >
          <div className="jump-corner relative h-40 w-28 flex-shrink-0 overflow-hidden border-2 border-border-strong bg-surface-raised">
            {item.coverImage ? (
              <Image src={item.coverImage} alt={title} fill className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 self-end">
            <h2 className="font-display text-xl uppercase leading-tight text-text-primary drop-shadow-[2px_2px_0_#000]">
              {title}
            </h2>
            {item.titleNative && (
              <p className="font-jp mt-0.5 text-sm text-text-muted">{item.titleNative}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 text-xs text-text-muted">
          {item.episodes ? <span>{item.episodes} episódios</span> : null}
          {item.status && (
            <span className="jump-badge bg-surface-raised px-2 py-0.5 font-bold uppercase text-text-body">
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
          )}
        </div>

        {item.genres.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 px-5">
            {item.genres.map((g) => (
              <span
                key={g}
                className="jump-badge bg-surface-raised px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-text-body"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {item.description ? (
          <p
            className="mt-4 px-5 pb-6 text-sm leading-relaxed text-text-body"
            dangerouslySetInnerHTML={{ __html: item.description }}
          />
        ) : (
          <p className="mt-4 px-5 pb-6 text-sm text-text-muted">
            Sem sinopse disponível.
          </p>
        )}
      </div>
    </div>
  );
}
