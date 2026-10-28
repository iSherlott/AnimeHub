"use client";

import type { ReactNode, SyntheticEvent } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { Box, Drawer, IconButton, Popover, useMediaQuery, useTheme } from "@mui/material";

/**
 * Moldura da prévia de uma obra (calendário, aba Animes do perfil): no celular, uma gaveta que sobe de baixo; do tablet
 * em diante, um cartão flutuante ao lado do item. Tocar ou clicar no item abre a prévia "presa" (fecha ao tocar fora,
 * no X ou com Esc); no computador o calendário também a mostra ao passar o mouse, e aí ela some quando o mouse sai.
 * A página da obra fica num botão dentro da prévia.
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
  // A prévia vive num portal, mas no React os eventos sobem até o item que a abriu: sem isso, clicar num botão da
  // prévia (ou no fundo, para fechar) também "clicava" no item e a reabria.
  const contain = { onClick: (e: SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: SyntheticEvent) => e.stopPropagation() };

  if (sheet) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        {...contain}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": label,
            "data-testid": testId,
            sx: { bgcolor: "#171820", backgroundImage: "none", borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85vh", overflowY: "auto" },
          } as Record<string, unknown>,
        }}
      >
        <Box sx={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44, bgcolor: "#171820" }}>
          <Box aria-hidden sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: "divider" }} />
          <IconButton aria-label="Fechar prévia" onClick={onClose} sx={{ position: "absolute", right: 4, top: 0 }}>
            <CloseIcon />
          </IconButton>
        </Box>
        {children}
      </Drawer>
    );
  }

  return (
    <Popover
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
          role: "dialog",
          "aria-label": label,
          "data-testid": testId,
          onMouseEnter: onPaperMouseEnter,
          onMouseLeave: onPaperMouseLeave,
          sx: { pointerEvents: "auto", bgcolor: "#171820", border: 1, borderColor: "divider", borderRadius: "12px", backgroundImage: "none" },
        } as Record<string, unknown>,
      }}
    >
      {children}
    </Popover>
  );
}
