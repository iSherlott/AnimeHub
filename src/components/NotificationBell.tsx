"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import Image from "next/image";
import NextLink from "next/link";
import NotificationsIcon from "@mui/icons-material/Notifications";
import {
  Badge,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import type { PublicUser } from "@/lib/auth/session";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";

type AiringAlertItem = {
  id: string;
  anilistId: number;
  episode: number;
  airingAt: string;
  seenAt: string | null;
  animeId: string | null;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  titlePortuguese: string | null;
  coverImage: string | null;
};

/** Igual ao de EpisodeGrid — o anime do alerta pode, em teoria, não ter mais
 * nenhum título carregado se já saiu da lista; resolveTitleTextLenient
 * degrada pelos campos de verdade, em vez de fingir que um deles é romaji. */
function resolveAlertTitle(
  preference: Parameters<typeof resolveTitleTextLenient>[0],
  alert: AiringAlertItem
): string {
  return resolveTitleTextLenient(
    preference,
    {
      titleRomaji: alert.titleRomaji,
      titleEnglish: alert.titleEnglish,
      titleNative: alert.titleNative,
      titlePortuguese: alert.titlePortuguese,
    },
    "Anime"
  );
}

const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Sino de "favoritos no ar agora" (Epic 10) — só aparece logado. Os dados
 * (services/notifier escreve, esta rota só lê) vêm com airingAt cru (ISO),
 * a hora exibida é calculada aqui no cliente, não formatada no servidor —
 * mesmo motivo do calendário: servidor e navegador podem discordar de fuso.
 */
export function NotificationBell({ user }: { user: PublicUser | null | undefined }) {
  const { preference } = useTitlePreference();
  const [alerts, setAlerts] = useState<AiringAlertItem[]>([]);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const buttonId = useId();
  const menuId = useId();

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

  function handleClose() {
    setAnchorEl(null);
  }

  return (
    <>
      <IconButton
        id={buttonId}
        onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        size="small"
        aria-label="Notificações"
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? "true" : undefined}
      >
        <Badge badgeContent={unseenCount} color="error">
          <NotificationsIcon fontSize="small" />
        </Badge>
      </IconButton>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: { sx: { width: 300 } },
          list: { "aria-labelledby": buttonId },
        }}
      >
        <Typography variant="overline" sx={{ px: 2, color: "text.secondary" }}>
          No ar agora
        </Typography>
        {alerts.length === 0 ? (
          <Typography variant="body2" sx={{ px: 2, py: 2, textAlign: "center", color: "text.secondary" }}>
            Nada da sua lista no ar agora.
          </Typography>
        ) : (
          alerts.map((alert) => {
            const time = new Date(alert.airingAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <MenuItem
                key={alert.id}
                component={alert.animeId ? NextLink : "div"}
                href={alert.animeId ? `/anime/${alert.animeId}` : undefined}
                onClick={() => {
                  handleClose();
                  if (!alert.seenAt) void markSeen(alert.id);
                }}
                sx={{ opacity: alert.seenAt ? 0.6 : 1, gap: 1.5 }}
              >
                <Box
                  sx={{
                    position: "relative",
                    width: 28,
                    height: 40,
                    flexShrink: 0,
                    bgcolor: "background.paper",
                  }}
                >
                  {alert.coverImage && (
                    <Image src={alert.coverImage} alt="" fill sizes="28px" className="object-cover" />
                  )}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap>
                    {resolveAlertTitle(preference, alert)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    EP {alert.episode} · {time}
                  </Typography>
                </Box>
              </MenuItem>
            );
          })
        )}
      </Menu>
    </>
  );
}
