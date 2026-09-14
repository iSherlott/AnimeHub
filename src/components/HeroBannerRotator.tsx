"use client";

import { useEffect, useState } from "react";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, IconButton, Tooltip } from "@mui/material";
import { HeroBanner, type HeroBannerData } from "@/components/HeroBanner";

/**
 * Alterna entre os heroes favoritados a cada intervalMs, pausando no hover
 * — só arma o timer quando há mais de um item (um único item, seja porque
 * só há 1 favorito ou porque caiu no fallback de página.tsx, nunca gira).
 *
 * Epic 20 (2ª auditoria de UX/UI): rotação automática sem controle
 * operável por teclado/toque violava WCAG 2.2.2 (Pause/Stop/Hide) — o
 * único jeito de pausar era passar o mouse. Agora tem um botão de
 * pausa/play sempre alcançável, respeita `prefers-reduced-motion`
 * (começa pausado, sem girar sozinho) e anuncia a troca via
 * `aria-live="polite"` pra quem usa leitor de tela.
 */
export function HeroBannerRotator({
  items,
  intervalMs = 8000,
}: {
  items: HeroBannerData[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const itemsKey = items.map((item) => item.id).join(",");

  useEffect(() => {
    // matchMedia só existe no navegador — SSR sempre renderiza "não
    // pausado" (senão, sem giro nenhum no servidor, teria mismatch de
    // hidratação); ajustar isso só é possível depois de montar.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserPaused(true);
    }
  }, []);

  const paused = hovered || userPaused;

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [itemsKey, items.length, paused, intervalMs]);

  if (items.length === 0) return null;

  const current = items[index % items.length];
  const canToggle = items.length > 1;

  return (
    <Box
      sx={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Box aria-live="polite">
        <HeroBanner {...current} />
      </Box>
      {canToggle && (
        <Tooltip title={userPaused ? "Retomar rotação" : "Pausar rotação"}>
          <IconButton
            onClick={() => setUserPaused((p) => !p)}
            aria-label={userPaused ? "Retomar rotação do destaque" : "Pausar rotação do destaque"}
            sx={{
              position: "absolute",
              right: { xs: 12, sm: 20 },
              top: 12,
              zIndex: 2,
              bgcolor: "rgba(0,0,0,0.7)",
              color: "#f7f7f5",
              "&:hover": { bgcolor: "rgba(0,0,0,0.85)" },
            }}
          >
            {userPaused ? <PlayArrowIcon /> : <PauseIcon />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
