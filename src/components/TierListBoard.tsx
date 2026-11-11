"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { Box, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import { TIER_COLORS, TIERS, type Tier, type TierSnapshot } from "@/lib/tierListTypes";

/** Capa + título de uma obra no quadro (montador e publicação usam a mesma peça). */
export function TierWorkFace({ title, cover, width = 72 }: { title: string; cover: string | null; width?: number }) {
  return (
    <>
      <Box sx={{ position: "relative", width: "100%", aspectRatio: "2 / 3", bgcolor: "#171820", flexShrink: 0 }}>{cover && <CoverImage src={cover} sizes={`${width}px`} />}</Box>
      <Typography component="span" sx={{ fontSize: 10, lineHeight: 1.2, mx: 0.5, my: 0.5, height: "2.4em", flexShrink: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textAlign: "left" }}>
        {title}
      </Typography>
    </>
  );
}

/** Uma faixa do quadro: a letra colorida à esquerda e as obras ao lado. */
export function TierRowFrame({ tier, label, children, highlighted = false, dropZone, minHeight = 96 }: { tier: Tier; label: ReactNode; children: ReactNode; highlighted?: boolean; dropZone?: string; minHeight?: number }) {
  return (
    <Box
      data-tier-drop={dropZone}
      data-testid={`tier-row-${tier}`}
      sx={{
        display: "flex",
        border: 1,
        borderColor: highlighted ? "secondary.main" : "divider",
        outline: highlighted ? "1px solid" : "none",
        outlineColor: "secondary.main",
        borderRadius: "12px",
        overflow: "hidden",
        minHeight,
        bgcolor: highlighted ? "action.hover" : "transparent",
        transition: "background-color 120ms, border-color 120ms",
      }}
    >
      {label}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1, flex: 1, minWidth: 0, alignContent: "flex-start" }}>{children}</Box>
    </Box>
  );
}

export function TierLetter({ tier, width = 56 }: { tier: Tier; width?: number }) {
  return (
    <Box sx={{ flex: `0 0 ${width}px`, bgcolor: TIER_COLORS[tier], color: "#08080b", fontSize: width >= 56 ? 28 : 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{tier}</Box>
  );
}

/** O quadro da tier list dentro da publicação: o mesmo formato do montador, cada capa leva à página da obra. */
export function TierListBoard({ snapshot }: { snapshot: TierSnapshot }) {
  return (
    <Box data-testid="post-tier-board" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {TIERS.map((tier) => (
        <TierRowFrame key={tier} tier={tier} minHeight={64} label={<TierLetter tier={tier} width={44} />}>
          {snapshot.tiers[tier].map((w) => (
            <Box
              key={w.key}
              component={NextLink}
              href={`/anime/${w.key}`}
              title={w.title}
              data-testid="post-tier-work"
              sx={{ width: { xs: 60, sm: 72 }, borderRadius: "8px", overflow: "hidden", bgcolor: "background.paper", color: "text.primary", textDecoration: "none", display: "flex", flexDirection: "column", "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main" }, "&:hover": { opacity: 0.85 } }}
            >
              <TierWorkFace title={w.title} cover={w.cover} />
            </Box>
          ))}
        </TierRowFrame>
      ))}
    </Box>
  );
}
