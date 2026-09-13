"use client";

import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { HeroBanner, type HeroBannerData } from "@/components/HeroBanner";

/**
 * Alterna entre os heroes favoritados a cada intervalMs, pausando no hover
 * — só arma o timer quando há mais de um item (um único item, seja porque
 * só há 1 favorito ou porque caiu no fallback de página.tsx, nunca gira).
 */
export function HeroBannerRotator({
  items,
  intervalMs = 8000,
}: {
  items: HeroBannerData[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const itemsKey = items.map((item) => item.id).join(",");

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [itemsKey, items.length, paused, intervalMs]);

  if (items.length === 0) return null;

  const current = items[index % items.length];

  return (
    <Box onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <HeroBanner {...current} />
    </Box>
  );
}
