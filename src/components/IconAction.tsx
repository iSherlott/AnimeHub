"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { IconButton, Tooltip, type SxProps, type Theme } from "@mui/material";

const baseSx = { width: 36, height: 36, bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", borderRadius: "10px", "&:hover": { bgcolor: "#1d1e28" } } as const;

/**
 * Ação só com ícone, com o nome ao passar o mouse (e para leitores de tela). Nas prévias das obras, três botões com
 * texto ("Ver página da obra", "Acompanhando", "Adiar a obra") não cabiam lado a lado em alguns títulos e quebravam o
 * cartão. Com `href` vira link.
 */
export function IconAction({
  label,
  icon,
  href,
  onClick,
  disabled = false,
  pressed,
  testId,
  sx,
}: {
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
  sx?: SxProps<Theme>;
}) {
  const common = { "aria-label": label, "data-testid": testId, size: "small" as const, sx: [baseSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])] };
  return (
    <Tooltip title={label} arrow>
      {/* O span deixa a dica aparecer mesmo com o botão desativado. */}
      <span style={{ display: "inline-flex" }}>
        {href ? (
          <IconButton component={NextLink} href={href} {...common}>
            {icon}
          </IconButton>
        ) : (
          <IconButton onClick={onClick} disabled={disabled} aria-pressed={pressed} {...common}>
            {icon}
          </IconButton>
        )}
      </span>
    </Tooltip>
  );
}
