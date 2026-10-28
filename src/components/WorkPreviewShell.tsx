"use client";

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import { Box, IconButton, Popover, SwipeableDrawer, useMediaQuery, useTheme, type PopoverActions } from "@mui/material";

/** Marca o item que abre uma prévia: é por ela que a prévia acha o anime anterior e o seguinte da página. */
export const WORK_TRIGGER = { "data-work-trigger": "" };
const TRIGGER_SELECTOR = "[data-work-trigger]";
const noop = () => {};

/** O item da página antes/depois do que abriu a prévia, na ordem em que aparecem (só os que estão na tela). */
function neighbor(anchor: HTMLElement | null, step: 1 | -1): HTMLElement | null {
  if (!anchor?.isConnected) return null;
  // A capa de uma linha da lista também abre a prévia: vale o item marcado da mesma linha.
  const self = anchor.closest<HTMLElement>(TRIGGER_SELECTOR) ?? anchor.closest("li")?.querySelector<HTMLElement>(TRIGGER_SELECTOR) ?? null;
  if (!self) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR)).filter((el) => el.getClientRects().length > 0);
  const i = all.indexOf(self);
  return i < 0 ? null : (all[i + step] ?? null);
}

/** Setas dentro de um campo (lista de situação, texto) são do campo, não da navegação entre animes. */
function ownsArrows(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("input, select, textarea, [contenteditable='true'], [role='listbox'], [role='menu'], [role='slider']"));
}

/**
 * Moldura da prévia de uma obra (calendário, Explorar, listas, perfil…): no celular, uma gaveta que sobe de baixo e
 * fecha ao ser arrastada para baixo; do tablet em diante, um cartão flutuante ao lado do item. Tocar ou clicar no item
 * abre a prévia "presa" (fecha ao tocar fora, no X ou com Esc); no computador o calendário também a mostra ao passar o
 * mouse, e aí ela some quando o mouse sai. Presa, as setas ← → (e, na gaveta, os botões ‹ ›) passam para o anime
 * anterior/seguinte da página sem fechar e reabrir à mão. A página da obra fica num botão dentro da prévia.
 */
export function WorkPreviewShell({
  open,
  anchorEl,
  pinned,
  onClose,
  label,
  onPaperMouseEnter,
  onPaperMouseLeave,
  testId,
  children,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  /** Aberta por toque/clique/teclado: recebe o foco e fecha ao tocar fora. Por hover, só acompanha o mouse. */
  pinned: boolean;
  onClose: () => void;
  /** Nome da prévia para leitores de tela ("Prévia de <obra>"). */
  label: string;
  onPaperMouseEnter?: () => void;
  onPaperMouseLeave?: () => void;
  testId?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const sheet = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  // Há anime antes/depois? (para desligar ‹ › nas pontas da gaveta).
  const neighbors = sheet && open && pinned ? { prev: Boolean(neighbor(anchorEl, -1)), next: Boolean(neighbor(anchorEl, 1)) } : { prev: false, next: false };
  // A gaveta que arrasta escuta toques na página inteira: só fica montada a partir da primeira abertura.
  const [sheetMounted, setSheetMounted] = useState(open);
  if (open && !sheetMounted) setSheetMounted(true);

  // O conteúdo pode crescer depois de aberto (a sinopse chega por último): o cartão se reposiciona para caber na tela.
  const popoverActions = useRef<PopoverActions>(null);
  const watchSize = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => popoverActions.current?.updatePosition());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function go(step: 1 | -1) {
    const target = neighbor(anchorEl, step);
    if (!target) return;
    onClose();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    target.click();
  }

  // A prévia vive num portal, mas no React os eventos sobem até o item que a abriu: sem isso, clicar num botão da
  // prévia (ou no fundo, para fechar) também "clicava" no item e a reabria.
  const contain = {
    onClick: (e: SyntheticEvent) => e.stopPropagation(),
    onKeyDown: (e: KeyboardEvent) => {
      e.stopPropagation();
      if (!pinned || e.defaultPrevented || (e.key !== "ArrowLeft" && e.key !== "ArrowRight") || ownsArrows(e.target)) return;
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    },
  };
  const paperA11y = { role: "dialog", "aria-label": label, "data-testid": testId, ...(pinned ? { "aria-keyshortcuts": "ArrowLeft ArrowRight" } : {}) };

  if (sheet) {
    if (!sheetMounted) return null;
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={noop}
        disableSwipeToOpen
        disableDiscovery
        {...contain}
        slotProps={{
          paper: {
            ...paperA11y,
            sx: { bgcolor: "#171820", backgroundImage: "none", borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85vh", overflowY: "auto" },
          } as Record<string, unknown>,
        }}
      >
        <Box sx={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44, bgcolor: "#171820" }}>
          {(neighbors.prev || neighbors.next) && (
            <Box sx={{ position: "absolute", left: 4, top: 0, display: "flex" }}>
              <IconButton aria-label="Anime anterior" disabled={!neighbors.prev} onClick={() => go(-1)}>
                <ChevronLeftIcon />
              </IconButton>
              <IconButton aria-label="Próximo anime" disabled={!neighbors.next} onClick={() => go(1)}>
                <ChevronRightIcon />
              </IconButton>
            </Box>
          )}
          {/* A alça: arrastar para baixo fecha. */}
          <Box aria-hidden sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: "divider" }} />
          <IconButton aria-label="Fechar prévia" onClick={onClose} sx={{ position: "absolute", right: 4, top: 0 }}>
            <CloseIcon />
          </IconButton>
        </Box>
        {children}
      </SwipeableDrawer>
    );
  }

  return (
    <Popover
      action={popoverActions}
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      {...contain}
      // Por hover a prévia não rouba o foco nem bloqueia a página; presa, vira um diálogo de verdade.
      disableAutoFocus={!pinned}
      disableEnforceFocus
      disableRestoreFocus={!pinned}
      // Travar a rolagem do <body> impedia descer a página com a roda do mouse.
      disableScrollLock
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      sx={{ pointerEvents: pinned ? "auto" : "none" }}
      slotProps={{
        paper: {
          ...paperA11y,
          onMouseEnter: onPaperMouseEnter,
          onMouseLeave: onPaperMouseLeave,
          sx: { pointerEvents: "auto", bgcolor: "#171820", border: 1, borderColor: "divider", borderRadius: "12px", backgroundImage: "none" },
        } as Record<string, unknown>,
      }}
    >
      <div ref={watchSize}>{children}</div>
    </Popover>
  );
}
