import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";

/** Caixa das colunas laterais: título com a contagem e o "ver todos". Comunidades e perfil. */
export function SideBox({ title, count, more, children, testId, id }: { title: string; count?: number; more?: { href: string; label: string }; children: ReactNode; testId?: string; id?: string }) {
  return (
    <Box component="section" id={id} data-testid={testId} sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper", scrollMarginTop: 96 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700 }}>
          {title}
          {count !== undefined && (
            <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", fontWeight: 400 }}>
              {" "}({count})
            </Typography>
          )}
        </Typography>
        {more && (
          <AppLink href={more.href} underline="hover" sx={{ fontSize: 12 }}>
            {more.label}
          </AppLink>
        )}
      </Box>
      {children}
    </Box>
  );
}
