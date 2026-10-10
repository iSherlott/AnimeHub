"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import NextLink from "next/link";
import { Box, Popover, Typography } from "@mui/material";
import type { CalendarItem } from "@/lib/calendarItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { isAiringNow } from "@/lib/airingWindow";
import { CalendarEntryPreview } from "@/components/CalendarEntryPreview";
import { formatTimeInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

/** Reavalia a cada minuto — sem isso, um bloco aberto numa aba esquecida
 * ficaria com o selo "NO AR" preso muito depois da janela real ter passado. */
const RECHECK_INTERVAL_MS = 60 * 1000;

/** Atraso entre sair do bloco (ou do próprio preview) e fechar de verdade —
 * sem isso, mover o mouse do bloco até o botão de favoritar dentro do
 * preview fecharia ele no meio do caminho. */
const CLOSE_DELAY_MS = 150;

/**
 * Bloco de lançamento posicionado na grade semanal (Figma `8:2181`):
 * "20:00 · EP02" + título, barra lateral de 3 px; os da minha lista ganham o
 * destaque de acento (fundo #2c111b + "✦ NOVO EPISÓDIO"). As medidas são em
 * `em` (a grade escala com o monitor), e `style` traz topo/altura/faixa.
 * Passar o mouse (ou focar) abre o preview com sinopse (lote 2 do Epic 27).
 */
export function CalendarEntryCard({ item, style }: { item: CalendarItem; style?: CSSProperties }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const timeZone = useTimeZone();
  const time = formatTimeInZone(new Date(item.airingAt), timeZone);

  // Começa false e só decide de verdade dentro do efeito — esse componente é
  // renderizado no servidor também, e o relógio do servidor pode discordar do
  // navegador bem na borda da janela (mismatch de hidratação).
  const [airingNow, setAiringNow] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const check = () => setAiringNow(isAiringNow(item.airingAt));
    check();
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [item.airingAt]);

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
  const airingNowLabel = `${title}, episódio ${item.episode}, no ar agora`;
  const highlighted = item.inMyList;

  return (
    <>
      <Box
        component={NextLink}
        href={href}
        data-testid={`calendar-entry-${item.key}`}
        onMouseEnter={openPreview}
        onMouseLeave={scheduleClose}
        onFocus={(e: React.FocusEvent<HTMLElement>) => openPreview({ currentTarget: e.currentTarget })}
        onBlur={scheduleClose}
        style={style}
        sx={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          gap: "0.143em",
          overflow: "hidden",
          boxSizing: "border-box",
          p: "0.571em",
          borderLeft: "3px solid",
          borderColor: highlighted ? "primary.main" : "divider",
          borderRadius: "0.571em",
          bgcolor: highlighted ? "#2c111b" : "#171820",
          color: "text.primary",
          textDecoration: "none",
          transition: "background-color 0.15s ease, outline-color 0.15s ease",
          "&:hover": { bgcolor: highlighted ? "#3a1423" : "#1d1e28" },
          // zIndex só no hover/foco para o bloco aberto ficar acima dos vizinhos.
          "&:hover, &:focus-visible": { zIndex: 2 },
        }}
      >
        <Typography component="span" sx={{ fontSize: "0.786em", lineHeight: 1.3 }} noWrap>
          {time} · EP{String(item.episode).padStart(2, "0")}
          {airingNow && (
            <Box component="span" role="status" aria-label={airingNowLabel} sx={{ ml: 0.5, fontWeight: 700, color: "primary.main" }}>
              · NO AR
            </Box>
          )}
        </Typography>
        <Typography component="span" lang={item.titleNative && title === item.titleNative ? "ja" : undefined} sx={{ fontSize: "0.857em", lineHeight: 1.3 }} noWrap>
          {title}
        </Typography>
        {highlighted && (
          <Typography component="span" sx={{ fontSize: "0.643em", fontWeight: 700, color: "primary.main", whiteSpace: "nowrap" }}>
            ✦ NOVO EPISÓDIO
          </Typography>
        )}
      </Box>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        anchorOrigin={{ vertical: "center", horizontal: "right" }}
        transformOrigin={{ vertical: "center", horizontal: "left" }}
        sx={{ pointerEvents: "none" }}
        slotProps={{
          paper: {
            onMouseEnter: cancelClose,
            onMouseLeave: scheduleClose,
            sx: { pointerEvents: "auto" },
          },
        }}
      >
        <CalendarEntryPreview item={item} />
      </Popover>
    </>
  );
}
