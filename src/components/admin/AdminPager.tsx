"use client";

import NextLink from "next/link";
import { Box, Button, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX } from "@/components/ExploreCard";

/**
 * Paginação das listas Admin feita no servidor: o estado vive na URL (`?pagina=N`, junto dos filtros), então "voltar"
 * e links compartilhados abrem a mesma página. Mostra a faixa atual e o total.
 */
export function AdminPager({ basePath, params, page, pages, total, pageSize, testId = "admin-pager" }: { basePath: string; params: Record<string, string>; page: number; pages: number; total: number; pageSize: number; testId?: string }) {
  const href = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...params, pagina: p > 0 ? String(p) : "" }).filter(([, v]) => v)).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <Box data-testid={testId} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
      <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid={`${testId}-range`}>
        {from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button component={NextLink} href={href(page - 1)} disabled={page <= 0} sx={ELEVATED_BUTTON_SX} data-testid={`${testId}-prev`}>
          Anterior
        </Button>
        <Button component={NextLink} href={href(page + 1)} disabled={page >= pages - 1} sx={ELEVATED_BUTTON_SX} data-testid={`${testId}-next`}>
          Próxima
        </Button>
      </Box>
    </Box>
  );
}
