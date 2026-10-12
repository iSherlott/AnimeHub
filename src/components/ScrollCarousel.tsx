"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, IconButton } from "@mui/material";

const arrowSx = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 1,
  width: 40,
  height: 40,
  bgcolor: "rgba(8,8,11,0.82)",
  color: "text.primary",
  border: 1,
  borderColor: "divider",
  "&:hover": { bgcolor: "rgba(23,24,32,0.95)" },
  "&.Mui-disabled": { display: "none" },
} as const;

/**
 * Carrossel horizontal no lugar da barra de rolagem: setas anterior/próximo nas bordas (só aparecem quando há
 * mais para ver), rolagem suave de ~80% da largura e encaixe item a item. Continua rolando com o toque/roda; a
 * barra de rolagem fica oculta. `label` nomeia a região para leitores de tela.
 */
export function ScrollCarousel({ children, label, gap = 3 }: { children: ReactNode; label: string; gap?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [update, children]);

  function scroll(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <Box sx={{ position: "relative" }} role="group" aria-roledescription="carrossel" aria-label={label} data-testid="carousel">
      <IconButton onClick={() => scroll(-1)} disabled={!canPrev} aria-label="Anterior" data-testid="carousel-prev" sx={{ ...arrowSx, left: -8 }}>
        <ChevronLeftIcon />
      </IconButton>
      <Box ref={ref} className="no-scrollbar" sx={{ display: "flex", gap, alignItems: "center", overflowX: "auto", scrollSnapType: "x proximity", py: 1, px: 1, "& > *": { scrollSnapAlign: "start" } }}>
        {children}
      </Box>
      <IconButton onClick={() => scroll(1)} disabled={!canNext} aria-label="Próximo" data-testid="carousel-next" sx={{ ...arrowSx, right: -8 }}>
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
}
