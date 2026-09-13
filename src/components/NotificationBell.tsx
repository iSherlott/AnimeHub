"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { PublicUser } from "@/lib/auth/session";

type AiringAlertItem = {
  id: string;
  anilistId: number;
  episode: number;
  airingAt: string;
  seenAt: string | null;
  animeId: string | null;
  titleRomaji: string | null;
  coverImage: string | null;
};

const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Sino de "favoritos no ar agora" (Epic 10) — só aparece logado. Os dados
 * (services/notifier escreve, esta rota só lê) vêm com airingAt cru (ISO),
 * a hora exibida é calculada aqui no cliente, não formatada no servidor —
 * mesmo motivo do calendário: servidor e navegador podem discordar de fuso.
 */
export function NotificationBell({ user }: { user: PublicUser | null | undefined }) {
  const [alerts, setAlerts] = useState<AiringAlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAlerts(data.alerts ?? []);
      } catch {
        // Silencioso — o sino simplesmente não atualiza nesta rodada.
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  if (!user) return null;

  const unseenCount = alerts.filter((a) => !a.seenAt).length;

  async function markSeen(id: string) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, seenAt: new Date().toISOString() } : a))
    );
    try {
      await fetch(`/api/notifications/${id}/seen`, { method: "POST" });
    } catch {
      // Sem rollback — na próxima rodada de polling o estado real do
      // servidor volta a prevalecer de qualquer forma.
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center text-text-muted transition hover:text-text-primary"
        aria-label="Notificações"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2Zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2Z" />
        </svg>
        {unseenCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-jump-red px-1 text-[10px] font-bold text-white">
            {unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="jump-corner absolute right-0 top-10 z-40 w-72 border-2 border-border bg-surface shadow-lg">
          <p className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wide text-text-muted">
            No ar agora
          </p>
          {alerts.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-text-muted">
              Nada da sua lista no ar agora.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {alerts.map((alert) => {
                const time = new Date(alert.airingAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const content = (
                  <div
                    className={`flex items-center gap-2 px-3 py-2 text-xs transition hover:bg-surface-raised ${
                      alert.seenAt ? "opacity-60" : ""
                    }`}
                  >
                    <div className="relative h-10 w-7 flex-shrink-0 overflow-hidden bg-surface-raised">
                      {alert.coverImage && (
                        <Image
                          src={alert.coverImage}
                          alt=""
                          fill
                          sizes="28px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-text-body">
                        {alert.titleRomaji ?? "Anime"}
                      </p>
                      <p className="text-text-muted">
                        EP {alert.episode} · {time}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={alert.id}>
                    {alert.animeId ? (
                      <Link
                        href={`/anime/${alert.animeId}`}
                        onClick={() => {
                          setOpen(false);
                          if (!alert.seenAt) void markSeen(alert.id);
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          if (!alert.seenAt) void markSeen(alert.id);
                        }}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
