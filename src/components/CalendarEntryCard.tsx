"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import NextLink from "next/link";
import Image from "next/image";
import { Box, Popover, Typography } from "@mui/material";
import type { CalendarItem } from "@/lib/calendarItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { isAiringNow } from "@/lib/airingWindow";
import { CalendarEntryPreview } from "@/components/CalendarEntryPreview";
import { formatTimeInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

/** Reavalia a cada minuto — sem isso, um card aberto numa aba esquecida
 * ficaria com o selo "NO AR" preso muito depois da janela real ter passado. */
const RECHECK_INTERVAL_MS = 60 * 1000;

/** Atraso entre sair do card (ou do próprio preview) e fechar de verdade —
 * sem isso, mover o mouse do card até o botão de favoritar dentro do
 * preview fecharia ele no meio do caminho. */
const CLOSE_DELAY_MS = 150;

/**
 * Uma linha só, pro item da lista (`inMyList`) e pros demais lançamentos —
 * antes eram 2 tratamentos bem diferentes (pôster 3:4 cheio vs. linha
 * pequena); trocados por 1 layout único, diferenciado só pela borda
 * esquerda (lote 2 do Epic 27 — pedido explícito do usuário: só um
 * destaque em volta, sem pôster grande nem selo flutuante).
 */
export function CalendarEntryCard({ item }: { item: CalendarItem }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const timeZone = useTimeZone();
  const time = formatTimeInZone(new Date(item.airingAt), timeZone);

  // Começa false (em vez de calcular já no useState) e só decide de verdade
  // dentro do efeito — esse componente é renderizado no servidor também, e
  // o relógio do servidor pode discordar do navegador bem na borda da
  // janela, o que causaria um mismatch de hidratação.
  const [airingNow, setAiringNow] = useState(false);
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de capa
  // que 404 (achado real da 6ª rodada de auditoria, Epic 18).
  const [coverBroken, setCoverBroken] = useState(false);
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
  function openPreview(e: MouseEvent<HTMLElement>) {
    cancelClose();
    setAnchorEl(e.currentTarget);
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setAnchorEl(null), CLOSE_DELAY_MS);
  }

  const isInternal = Boolean(item.inMyList && item.animeId);
  // Anúncio de leitor de tela pra role="status" dispara fora do contexto de
  // onde o usuário está navegando — sem nomear o anime/episódio, um selo
  // genérico "No ar agora" fica sem sentido quando escutado sozinho, ainda
  // mais com vários cards podendo entrar na janela por perto um do outro.
  const airingNowLabel = `${title}, episódio ${item.episode}, no ar agora`;

  const content = (
    <>
      <Box sx={{ position: "relative", height: 60, width: 44, flexShrink: 0, overflow: "hidden", bgcolor: "background.default" }}>
        {item.coverImage && !coverBroken ? (
          <Image
            src={item.coverImage}
            alt=""
            fill
            sizes="44px"
            style={{ objectFit: "cover" }}
            onError={() => setCoverBroken(true)}
          />
        ) : null}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            color: "text.primary",
          }}
        >
          {title}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: 11, color: "text.secondary" }}>
          {time} · EP {item.episode}
          {airingNow && (
            <Box
              component="span"
              role="status"
              aria-label={airingNowLabel}
              sx={{ ml: 0.5, fontWeight: 700, color: "error.main" }}
            >
              · NO AR
            </Box>
          )}
        </Typography>
      </Box>
    </>
  );

  const linkSx = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    borderLeft: item.inMyList ? 3 : 1,
    borderColor: item.inMyList ? "secondary.main" : "divider",
    bgcolor: "background.paper",
    p: 0.75,
    textDecoration: "none",
    transition: "background-color 0.15s ease",
    "&:hover": { bgcolor: "background.default", borderColor: item.inMyList ? "secondary.main" : "primary.main" },
  } as const;

  return (
    <>
      {isInternal ? (
        <Box
          component={NextLink}
          href={`/anime/${item.animeId}`}
          sx={linkSx}
          onMouseEnter={openPreview}
          onMouseLeave={scheduleClose}
        >
          {content}
        </Box>
      ) : (
        <Box
          component={NextLink}
          href={`/obra/${item.anilistId}`}
          sx={linkSx}
          onMouseEnter={openPreview}
          onMouseLeave={scheduleClose}
        >
          {content}
        </Box>
      )}
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
