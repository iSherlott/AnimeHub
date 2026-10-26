"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import NextLink from "next/link";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import {
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
import { formatRelativeTime } from "@/lib/relativeTime";
import { useTimeZone } from "@/lib/useTimeZone";

type AiringAlertItem = {
  id: string;
  anilistId: number;
  episode: number;
  airingAt: string;
  seenAt: string | null;
  /** Horário anterior quando a data do episódio mudou ("Data alterada"). */
  previousAiringAt: string | null;
  /** "EPISODE" (lançamento / data alterada) | "RETURN" (voltou a sair episódios). */
  kind?: "EPISODE" | "RETURN";
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
/** Quantas notificações cada canal mostra antes de "Ver mais". */
const PREVIEW_COUNT = 5;

/** "sábado, 10 out · 13:00" no fuso escolhido (Figma: "DATA ALTERADA · Nova data…"). */
function formatInZone(date: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", day: "numeric", month: "short" }).format(date).replace(".", "");
  return `${day} · ${formatTimeInZone(date, timeZone)}`;
}

/**
 * Sino único com dois canais (Figma `13:43025`): "Lançamentos" (favoritos no
 * ar agora e "Data alterada", Epic 10) e "Social" (respostas, novos
 * seguidores, curtidas). Só aparece logado. O contador é um número só (os dois
 * canais somados); cada canal mostra as 5 mais recentes e "Ver mais" abre as
 * demais; "Marcar todas como lidas", no topo, vale para os dois canais. Os dados (services/notifier e as
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
  const [expanded, setExpanded] = useState(false);
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

  async function markAllRead() {
    const now = new Date().toISOString();
    setAlerts((prev) => prev.map((a) => (a.seenAt ? a : { ...a, seenAt: now })));
    setSocial((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      // idem
    }
  }

  function handleClose() {
    setAnchorEl(null);
    setExpanded(false);
  }

  const visibleAlerts = expanded ? alerts : alerts.slice(0, PREVIEW_COUNT);
  const visibleSocial = expanded ? social : social.slice(0, PREVIEW_COUNT);
  const hidden = channel === "releases" ? alerts.length - visibleAlerts.length : social.length - visibleSocial.length;

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
        sx={{ borderRadius: "10px" }}
      >
        {/* Sino + contador único (os dois canais somados); só aparece quando há algo novo. */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
          <NotificationsNoneIcon sx={{ fontSize: 20 }} />
          {unseenCount > 0 && (
            <Box
              component="span"
              data-testid="bell-counts"
              aria-label={`${unseenCount} ${unseenCount === 1 ? "notificação não lida" : "notificações não lidas"}`}
              sx={{ bgcolor: "#2c111b", color: "primary.main", fontSize: 11, fontWeight: 700, px: 1, py: 0.75, borderRadius: "6px", lineHeight: 1.5, minWidth: 24, textAlign: "center" }}
            >
              {unseenCount > 99 ? "99+" : unseenCount}
            </Box>
          )}
        </Box>
      </IconButton>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: { sx: { width: 460, maxWidth: "calc(100vw - 32px)", bgcolor: "background.paper", backgroundImage: "none", borderRadius: "16px", p: 3, mt: 1 } },
          list: { "aria-labelledby": buttonId, sx: { p: 0 } },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <Typography component="h2" sx={{ fontSize: 26, lineHeight: 1.5 }}>
            Notificações
          </Typography>
          <Button size="small" onClick={() => void markAllRead()} disabled={unseenCount === 0} data-testid="bell-mark-all" sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
            Marcar todas como lidas
          </Button>
        </Box>
        <Tabs value={channel} onChange={(_, v) => { setChannel(v); setExpanded(false); }} aria-label="Canais de notificação" sx={{ mb: 2 }}>
          <Tab value="releases" label={unseenReleases > 0 ? `Lançamentos · ${unseenReleases}` : "Lançamentos"} />
          <Tab value="social" label={unreadSocial > 0 ? `Social · ${unreadSocial}` : "Social"} />
        </Tabs>

        {channel === "releases" ? (
          alerts.length === 0 ? (
            <Typography sx={{ py: 2, color: "text.secondary", fontSize: 14 }}>Nenhum lançamento da sua lista hoje nem no ar agora.</Typography>
          ) : (
            visibleAlerts.map((alert) => {
              const when = new Date(alert.airingAt);
              // Aviso antecipado: o episódio ainda vai ao ar (lembrete de hoje).
              const upcoming = when > new Date();
              const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(when) === new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
              const returned = alert.kind === "RETURN";
              const changed = Boolean(alert.previousAiringAt);
              const before = alert.previousAiringAt ? new Date(alert.previousAiringAt) : null;
              return (
                <MenuItem
                  key={alert.id}
                  component={NextLink}
                  href={`/anime/${alert.animeId ?? alert.anilistId}`}
                  onClick={() => {
                    handleClose();
                    if (!alert.seenAt) void markSeen(alert.id);
                  }}
                  sx={{ opacity: alert.seenAt ? 0.6 : 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.5, whiteSpace: "normal", px: 0, py: 2, borderTop: 1, borderColor: "divider", borderRadius: 0 }}
                >
                  <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{resolveAlertTitle(preference, alert)}</Typography>
                  {changed && (
                    <Typography data-testid="date-changed" sx={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>
                      Data alterada
                    </Typography>
                  )}
                  {returned ? (
                    <>
                      <Typography data-testid="returned-alert" sx={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" }}>
                        Voltou a sair episódios
                      </Typography>
                      <Typography sx={{ fontSize: 14 }}>
                        {upcoming ? "Próximo episódio · " : "No ar desde · "}
                        {formatInZone(when, timeZone)}. Está de volta à sua lista e ao calendário.
                      </Typography>
                    </>
                  ) : (
                    <Typography sx={{ fontSize: 14 }}>
                      EP{String(alert.episode).padStart(2, "0")}{" "}
                      {changed ? "· Nova data: " : upcoming ? "vai ao ar · " : "disponível · "}
                      {upcoming && today && !changed ? `hoje às ${formatTimeInZone(when, timeZone)}` : formatInZone(when, timeZone)}
                    </Typography>
                  )}
                  {changed && before && (
                    <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Antes: {formatInZone(before, timeZone)}</Typography>
                  )}
                </MenuItem>
              );
            })
          )
        ) : !user.preferences.notifyReplies && !user.preferences.notifyComments && !user.preferences.notifyFollowers && !user.preferences.notifyLikes ? (
          <Box sx={{ py: 2, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
            <Typography sx={{ fontSize: 20 }}>Notificações sociais desativadas</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Seus alertas de lançamentos continuam ativos.</Typography>
            <Button component={NextLink} href="/configuracoes" onClick={handleClose} sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
              Configurar Social
            </Button>
          </Box>
        ) : social.length === 0 ? (
          <Box sx={{ py: 2, display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography sx={{ fontSize: 20 }}>Você está em dia.</Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Novas respostas e seguidores aparecerão aqui.</Typography>
          </Box>
        ) : (
          <>
            {visibleSocial.map((n) => (
              <MenuItem
                key={n.id}
                component={n.href ? NextLink : "div"}
                href={n.href ?? undefined}
                onClick={() => {
                  handleClose();
                  if (!n.readAt) void markSocialRead(n.id);
                }}
                sx={{ display: "flex", alignItems: "flex-start", gap: 2, whiteSpace: "normal", px: 0, py: 2, borderTop: 1, borderColor: "divider", borderRadius: 0 }}
              >
                <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", mt: "8px", flexShrink: 0, bgcolor: n.readAt ? "transparent" : "primary.main" }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14 }}>{socialText(n)}.</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
                    {n.readAt ? "Lida" : "Não lida"} · {formatRelativeTime(n.createdAt)}
                  </Typography>
                  {n.unavailable ? (
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>Publicação removida</Typography>
                  ) : (
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>Abrir contexto →</Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </>
        )}
        {hidden > 0 && (
          <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
            <Button onClick={() => setExpanded(true)} data-testid="bell-more" sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
              Ver mais ({hidden})
            </Button>
          </Box>
        )}
      </Menu>
    </>
  );
}
