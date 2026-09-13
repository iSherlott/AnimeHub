"use client";

import { ThemeProvider, CssBaseline } from "@mui/material";
import { muiTheme } from "@/lib/muiTheme";

/**
 * O tema (objeto com funções como breakpoints.up/down) não pode atravessar
 * a fronteira servidor/cliente como prop de um Server Component — por isso
 * este wrapper existe: o import de muiTheme roda inteiro dentro do bundle
 * cliente, nunca é serializado a partir de src/app/layout.tsx.
 */
export function MuiProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
