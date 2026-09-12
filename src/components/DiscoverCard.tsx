"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { DiscoverItem } from "@/lib/discoverItem";
import { KNOWN_PLATFORMS } from "@/lib/types";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { AnimeInfoModal } from "@/components/AnimeInfoModal";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

function formatNextEpisode(iso: string | null, number: number | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (date.getTime() < Date.now()) return null;
  const formatted = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  return number ? `Ep ${number} em ${formatted}` : `Próximo em ${formatted}`;
}

export function DiscoverCard({ item, rank }: { item: DiscoverItem; rank?: number }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [platform, setPlatform] = useState<string>(KNOWN_PLATFORMS[0]);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const nextEpisodeLabel = formatNextEpisode(item.nextEpisodeAt, item.nextEpisodeNumber);
  const canAdd = item.anilistId != null;

  // O popover é portalado pra <body> (não fica preso no clipping do carrossel
  // horizontal — ver handleAddButtonClick), então o "clique fora" precisa
  // considerar tanto o botão quanto o próprio popover portalado.
  useEffect(() => {
    if (!expanded) return;
    function onClickAway(e: MouseEvent) {
      const target = e.target as Node;
      if (
        addButtonRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setExpanded(false);
    }
    function onScrollOrResize() {
      setExpanded(false);
    }
    document.addEventListener("mousedown", onClickAway);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [expanded]);

  function handleAddButtonClick() {
    if (!canAdd || user === undefined) return; // ainda checando se está logado
    if (!user) {
      router.push("/login");
      return;
    }
    if (!expanded && addButtonRef.current) {
      const rect = addButtonRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 8, left: Math.max(8, rect.right - 224) });
    }
    setExpanded((v) => !v);
  }

  async function handleAdd() {
    if (!item.anilistId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/anime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anilistId: item.anilistId,
          platform,
          url: url.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao adicionar");
        return;
      }
      setDone(true);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group relative w-36 flex-shrink-0 sm:w-44">
      <div className="jump-corner jump-shadow relative border-2 border-border bg-surface transition-all duration-150 ease-out group-hover:z-20 group-hover:-translate-y-1 group-hover:border-jump-red group-hover:jump-shadow-lg">
        <div className="relative aspect-[2/3] w-full overflow-hidden">
          {item.coverImage ? (
            <Image
              src={item.coverImage}
              alt={title}
              fill
              sizes="192px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-text-muted">
              {title}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

          {item.cached && (
            <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-cache/90 px-2 py-0.5 text-[9px] font-bold uppercase text-ink">
              ⛁ cache
            </span>
          )}

          <button
            ref={addButtonRef}
            onClick={handleAddButtonClick}
            disabled={done || !canAdd}
            className={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-lg font-bold text-text-primary transition ${
              done
                ? "bg-status-completed text-ink"
                : canAdd
                  ? "bg-black/70 hover:bg-jump-red"
                  : "cursor-not-allowed bg-surface-raised/80 text-text-muted opacity-50"
            }`}
            title={
              done
                ? "Adicionado"
                : !canAdd
                  ? "Disponível quando a AniList voltar ao ar"
                  : user === undefined
                    ? "Carregando..."
                    : user
                      ? "Adicionar à lista"
                      : "Faça login para adicionar"
            }
          >
            {done ? "✓" : canAdd ? "+" : "…"}
          </button>

          {nextEpisodeLabel && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/85 px-1.5 py-1 text-center text-[10px] font-bold uppercase text-status-completed">
              {nextEpisodeLabel}
            </span>
          )}

          {rank && (
            <span
              className={`font-display absolute -bottom-1 -left-1 text-4xl leading-none drop-shadow-[2px_2px_0_#000] ${
                rank <= 3 ? "text-jump-red" : "text-text-muted"
              }`}
            >
              {rank}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => setShowInfo(true)}
        className="font-display mt-2 line-clamp-2 text-left text-xs uppercase leading-tight text-text-primary transition hover:text-jump-red-bright hover:underline"
      >
        {title}
      </button>
      {item.episodes ? (
        <p className="text-[10px] text-text-muted">{item.episodes} eps</p>
      ) : null}

      {expanded &&
        popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left }}
            className="jump-corner jump-shadow-lg z-50 w-56 space-y-2 border-2 border-border-strong bg-surface p-3 text-xs"
          >
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full border border-border bg-surface-raised p-1.5 text-text-primary"
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
              placeholder="Link do título (opcional)"
              className="w-full border border-border bg-surface-raised p-1.5 text-text-primary placeholder:text-text-muted"
            />
            {error && <p className="text-jump-red-bright">{error}</p>}
            <button
              onClick={handleAdd}
              disabled={saving}
              className="jump-shadow w-full border-2 border-border-strong bg-jump-red py-1.5 font-display uppercase tracking-wide text-text-primary transition hover:bg-jump-red-bright disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Adicionar"}
            </button>
          </div>,
          document.body
        )}

      {showInfo && <AnimeInfoModal item={item} onClose={() => setShowInfo(false)} />}
    </div>
  );
}
