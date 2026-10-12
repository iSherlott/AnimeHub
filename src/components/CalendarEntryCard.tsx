"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import NextLink from "next/link";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import BookmarkAddedIcon from "@mui/icons-material/BookmarkAdded";
import { Box, Popover, Typography } from "@mui/material";
import type { CalendarItem } from "@/lib/calendarItem";
import { PrimaryTitle, useTitleLines } from "@/components/ExploreCard";
import { isAiringNow } from "@/lib/airingWindow";
import { CalendarEntryPreview } from "@/components/CalendarEntryPreview";
import { CoverImage } from "@/components/CoverImage";
import { formatTimeInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

/** Reavalia a cada minuto — sem isso, um bloco aberto numa aba esquecida
 * ficaria com o selo "NO AR" preso muito depois da janela real ter passado. */
const RECHECK_INTERVAL_MS = 60 * 1000;

/** Atraso entre sair do item (ou do próprio preview) e fechar de verdade —
 * sem isso, mover o mouse até o botão dentro do preview fecharia no caminho. */
const CLOSE_DELAY_MS = 150;

/** Selo do Figma (`10:23` Atrasado / `10:28` Novo episódio): 11 px bold, raio 6. */
function Badge({ tone, icon, children }: { tone: "accent" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.571em",
        alignSelf: "flex-start",
        px: "0.571em",
        py: "0.429em",
        borderRadius: "0.429em",
        bgcolor: tone === "accent" ? "#2c111b" : "#171820",
        color: tone === "accent" ? "primary.main" : "warning.main",
        "& svg": { fontSize: "1em" },
      }}
    >
      {icon}
      <Typography component="span" sx={{ fontSize: "0.786em", fontWeight: 700, lineHeight: 1.5, whiteSpace: "nowrap", color: "inherit" }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * Item de lançamento na coluna do dia (Figma `8:2106`, "Item"/"Item novo ep"/
 * "Item atrasado"): horário, título e EP; os da minha lista ganham o fundo de
 * acento + selo "NOVO EPISÓDIO EPnn", os atrasados a barra âmbar + "Atrasado".
 * As medidas são em `em` (a grade escala com o monitor). Passar o mouse (ou
 * focar) abre o preview com sinopse.
 */
export function CalendarEntryCard({
  item,
  onFollowed,
  onPendingChange,
  highlightMine = false,
}: {
  item: CalendarItem;
  onFollowed?: (anilistId: number, animeId: string) => void;
  onPendingChange?: (anilistId: number, fromEpisode: number | null) => void;
  /** Destaca (vermelho) o que é da minha lista — só faz sentido em "Todos"; em "Minha Lista" tudo seria vermelho. */
  highlightMine?: boolean;
}) {
  const titleLines = useTitleLines(item);
  const title = titleLines.primary;
  const timeZone = useTimeZone();
  const time = item.endsAt
    ? `${formatTimeInZone(new Date(item.airingAt), timeZone)} – ${formatTimeInZone(new Date(item.endsAt), timeZone)}`
    : formatTimeInZone(new Date(item.airingAt), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Episódios em sequência no mesmo dia: um só item, "EP01–02", com o horário estendido.
  const episode = item.episodeEnd ? `EP${pad(item.episode)}–${pad(item.episodeEnd)}` : `EP${pad(item.episode)}`;

  // Começa false e só decide de verdade dentro do efeito — esse componente é
  // renderizado no servidor também, e o relógio do servidor pode discordar do
  // navegador bem na borda da janela (mismatch de hidratação).
  const [airingNow, setAiringNow] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const check = () => setAiringNow(isAiringNow(item.airingAt) || (item.lastAiringAt !== undefined && isAiringNow(item.lastAiringAt)));
    check();
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [item.airingAt, item.lastAiringAt]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function openPreview(e: MouseEvent<HTMLElement> | { currentTarget: HTMLElement }) {
    cancelClose();
    setAnchorEl(e.currentTarget);
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setAnchorEl(null), CLOSE_DELAY_MS);
  }

  const isInternal = Boolean(item.inMyList && item.animeId);
  const href = isInternal ? `/anime/${item.animeId}` : `/obra/${item.anilistId}`;
  // Anúncio de leitor de tela pra role="status" dispara fora do contexto de
  // onde a pessoa está navegando — sem nomear o anime/episódio, um selo
  // genérico "No ar agora" fica sem sentido quando escutado sozinho.
  const airingNowLabel = `${title}, ${item.episodeEnd ? `episódios ${item.episode} a ${item.episodeEnd}` : `episódio ${item.episode}`}, no ar agora`;
  const highlighted = highlightMine && item.inMyList;
  const image = item.episodeImage ?? item.coverImage;
  const barColor = item.delayed ? "warning.main" : highlighted ? "primary.main" : "transparent";

  return (
    <>
      <Box
        component={NextLink}
        href={href}
        data-testid={`calendar-entry-${item.key}`}
        data-delayed={item.delayed ? "true" : undefined}
        onMouseEnter={openPreview}
        onMouseLeave={scheduleClose}
        onFocus={(e: React.FocusEvent<HTMLElement>) => openPreview({ currentTarget: e.currentTarget })}
        onBlur={scheduleClose}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "0.286em",
          minHeight: "7.429em",
          boxSizing: "border-box",
          px: "0.857em",
          py: "0.714em",
          borderLeft: "3px solid",
          borderColor: barColor,
          bgcolor: highlighted ? "#2c111b" : "background.paper",
          color: "text.primary",
          textDecoration: "none",
          transition: "background-color 0.15s ease",
          "&:hover": { bgcolor: highlighted ? "#3a1423" : "#171820" },
          "&:focus-visible": { outlineOffset: -2 },
        }}
      >
        <Typography component="span" sx={{ fontSize: "0.786em", fontWeight: 600, lineHeight: 1.3, color: "text.secondary", whiteSpace: "nowrap" }}>
          {time}
        </Typography>
        <Box sx={{ display: "flex", gap: "0.643em", alignItems: "flex-start", minWidth: 0 }}>
          {/* Imagem do episódio; sem ela, a capa do anime — dá a noção de qual obra/episódio é. */}
          <Box
            aria-hidden
            data-testid={`calendar-entry-image-${item.key}`}
            data-image-kind={item.episodeImage ? "episode" : item.coverImage ? "cover" : "none"}
            sx={{ position: "relative", flexShrink: 0, width: "3.714em", aspectRatio: "3 / 4", borderRadius: "0.357em", overflow: "hidden", bgcolor: "#171820" }}
          >
            {image && <CoverImage src={image} sizes="96px" />}
          </Box>
          <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.286em" }}>
            <Typography
              component="span"
              lang={titleLines.primaryLang}
              sx={{ fontSize: "0.929em", fontWeight: 700, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}
            >
              <PrimaryTitle lines={titleLines} />
            </Typography>
            <Typography component="span" sx={{ fontSize: "0.714em", lineHeight: 1.3, color: "text.secondary" }}>
              {episode}
            </Typography>
          </Box>
        </Box>
        {/* Só quem está sendo exibido agora ganha selo; os demais ficam sem nenhuma marca. */}
        {airingNow && (
          <Box role="status" aria-label={airingNowLabel}>
            <Badge tone="accent" icon={<FiberManualRecordIcon />}>
              AO VIVO
            </Badge>
          </Box>
        )}
        {item.delayed && (
          <Badge tone="warning" icon={<EventRepeatIcon />}>
            Atrasado
          </Badge>
        )}
        {item.pendingFrom != null && (
          <Box data-testid={`calendar-pending-${item.key}`}>
            <Badge tone="warning" icon={<BookmarkAddedIcon />}>
              Adiado · EP{pad(item.pendingFrom)}
            </Badge>
          </Box>
        )}
      </Box>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        // O preview abre ao passar o mouse: travar a rolagem do <body> impedia descer a página com a roda do mouse.
        disableScrollLock
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        sx={{ pointerEvents: "none" }}
        slotProps={{
          paper: {
            onMouseEnter: cancelClose,
            onMouseLeave: scheduleClose,
            sx: { pointerEvents: "auto", bgcolor: "#171820", border: 1, borderColor: "divider", borderRadius: "12px", backgroundImage: "none" },
          },
        }}
      >
        <CalendarEntryPreview item={item} onFollowed={onFollowed} onPendingChange={onPendingChange} />
      </Popover>
    </>
  );
}
