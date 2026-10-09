"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import Image from "next/image";
import NextLink from "next/link";
import NotificationsIcon from "@mui/icons-material/Notifications";
import {
  Badge,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import type { PublicUser } from "@/lib/auth/session";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";
import { formatTimeInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

type AiringAlertItem = {
  id: string;
  anilistId: number;
  episode: number;
  airingAt: string;
  seenAt: string | null;
  /** Horário anterior quando a data do episódio mudou ("Data alterada"). */
  previousAiringAt: string | null;
  animeId: string | null;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  titlePortuguese: string | null;
  coverImage: string | null;
};

type SocialItem = {
  id: string;
  type: "POST_REPLY" | "COMMENT_REPLY" | "NEW_FOLLOWER" | "POST_LIKE";
  actor: { id: string; displayName: string };
  readAt: string | null;
  createdAt: string;
  unavailable: boolean;
  href: string | null;
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

/** Texto só pelo TIPO do evento — o conteúdo (possível spoiler) nunca entra na notificação. */
function socialText(n: SocialItem): string {
  switch (n.type) {
    case "POST_REPLY":
      return `${n.actor.displayName} respondeu à sua publicação`;
    case "COMMENT_REPLY":
      return `${n.actor.displayName} respondeu ao seu comentário`;
    case "NEW_FOLLOWER":
      return `${n.actor.displayName} começou a seguir você`;
    case "POST_LIKE":
      return `${n.actor.displayName} curtiu sua publicação`;
  }
}

const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Sino único com dois canais (Figma `13:43025`): "Lançamentos" (favoritos no
 * ar agora e "Data alterada", Epic 10) e "Social" (respostas, novos
 * seguidores, curtidas). Só aparece logado. Os dados (services/notifier e as
 * rotas sociais escrevem, `GET /api/notifications` só lê) chegam com horários
 * crus (ISO); a hora exibida é calculada aqui, no fuso escolhido na conta —
 * mesmo motivo do calendário.
 */
export function NotificationBell({ user }: { user: PublicUser | null | undefined }) {
  const { preference } = useTitlePreference();
  const timeZone = useTimeZone();
  const [alerts, setAlerts] = useState<AiringAlertItem[]>([]);
  const [social, setSocial] = useState<SocialItem[]>([]);
  const [channel, setChannel] = useState<"releases" | "social">("releases");
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de capa
  // que 404 (achado real da 6ª rodada de auditoria, Epic 18). Chave por
  // alert.id porque o menu lista várias capas ao mesmo tempo.
  const [brokenCovers, setBrokenCovers] = useState<Record<string, boolean>>({});
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
        if (cancelled) return;
        setAlerts(data.alerts ?? []);
        setSocial(data.social ?? []);
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

  const unseenReleases = alerts.filter((a) => !a.seenAt).length;
  const unreadSocial = social.filter((n) => !n.readAt).length;
  const unseenCount = unseenReleases + unreadSocial;

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

  async function markSocialRead(id: string) {
    setSocial((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    try {
      await fetch(`/api/notifications/social/${id}/read`, { method: "POST" });
    } catch {
      // idem
    }
  }

  async function markAllSocialRead() {
    setSocial((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    try {
      await fetch("/api/notifications/social/read-all", { method: "POST" });
    } catch {
      // idem
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
          paper: { sx: { width: 320 } },
          list: { "aria-labelledby": buttonId },
        }}
      >
        <Tabs
          value={channel}
          onChange={(_, v) => setChannel(v)}
          variant="fullWidth"
          aria-label="Canais de notificação"
          sx={{ minHeight: 40 }}
        >
          <Tab
            value="releases"
            label={unseenReleases > 0 ? `Lançamentos (${unseenReleases})` : "Lançamentos"}
            sx={{ minHeight: 40 }}
          />
          <Tab value="social" label={unreadSocial > 0 ? `Social (${unreadSocial})` : "Social"} sx={{ minHeight: 40 }} />
        </Tabs>

        {channel === "releases" ? (
          alerts.length === 0 ? (
            <Typography variant="body2" sx={{ px: 2, py: 2, textAlign: "center", color: "text.secondary" }}>
              Nada da sua lista no ar agora.
            </Typography>
          ) : (
            alerts.map((alert) => {
              const time = formatTimeInZone(new Date(alert.airingAt), timeZone);
              const changed = Boolean(alert.previousAiringAt);
              return (
                <MenuItem
                  key={alert.id}
                  component={NextLink}
                  href={`/obra/${alert.anilistId}`}
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
                    {alert.coverImage && !brokenCovers[alert.id] && (
                      <Image
                        src={alert.coverImage}
                        alt=""
                        fill
                        sizes="28px"
                        className="object-cover"
                        onError={() => setBrokenCovers((prev) => ({ ...prev, [alert.id]: true }))}
                      />
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap>
                      {resolveAlertTitle(preference, alert)}
                    </Typography>
                    {changed && (
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }} data-testid="date-changed">
                        Data alterada
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      EP {alert.episode} · {time}
                      {changed && alert.previousAiringAt
                        ? ` (antes: ${formatTimeInZone(new Date(alert.previousAiringAt), timeZone)})`
                        : ""}
                    </Typography>
                  </Box>
                </MenuItem>
              );
            })
          )
        ) : social.length === 0 ? (
          <Typography variant="body2" sx={{ px: 2, py: 2, textAlign: "center", color: "text.secondary" }}>
            Nenhuma novidade social por enquanto.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1 }}>
              <Button size="small" onClick={markAllSocialRead} disabled={unreadSocial === 0}>
                Marcar Social como lido
              </Button>
            </Box>
            {social.map((n) => (
              <MenuItem
                key={n.id}
                component={n.href ? NextLink : "div"}
                href={n.href ?? undefined}
                onClick={() => {
                  handleClose();
                  if (!n.readAt) void markSocialRead(n.id);
                }}
                sx={{ opacity: n.readAt ? 0.6 : 1, whiteSpace: "normal" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">{socialText(n)}</Typography>
                  {n.unavailable && (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Publicação removida
                    </Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </>
  );
}
