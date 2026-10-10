"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { Box } from "@mui/material";

/** Botão-link das telas Admin (cliente: `NextLink` não cruza a fronteira de Server Component). */
export function AdminButtonLink({ href, children, variant = "elevated", icon }: { href: string; children: ReactNode; variant?: "elevated" | "primary"; icon?: ReactNode }) {
  return (
    <Box
      component={NextLink}
      href={href}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        minHeight: 44,
        boxSizing: "border-box",
        borderRadius: "10px",
        fontSize: 14,
        fontWeight: 700,
        textDecoration: "none",
        border: 1,
        ...(variant === "primary"
          ? { bgcolor: "primary.main", borderColor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }
          : { bgcolor: "#171820", borderColor: "divider", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }),
        "& svg": { fontSize: 18 },
      }}
    >
      {icon}
      {children}
    </Box>
  );
}
