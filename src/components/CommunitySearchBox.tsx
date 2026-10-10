"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import SearchIcon from "@mui/icons-material/Search";
import { Box, ButtonBase, InputBase, Typography } from "@mui/material";

/**
 * Campo "Busca na Comunidade" do Figma (`13:41214`): rótulo de 12 px
 * semi-negrito, entrada "surface" com borda e raio 10 e lupa de 18 px.
 * Leva para `/buscar?q=…&scope=posts` (SOC-004); uma busca é uma navegação
 * de verdade, então voltar do navegador restaura consulta e escopo (SOC-005).
 */
export function CommunitySearchBox({ initialQuery = "", scope = "posts" }: { initialQuery?: string; scope?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const inputId = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/buscar?${new URLSearchParams({ q, scope }).toString()}`);
  }

  return (
    <Box component="form" onSubmit={submit} role="search" aria-label="Buscar na comunidade" sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
      <Typography component="label" htmlFor={inputId} sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
        Busca na Comunidade
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          p: 2,
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: "10px",
          "&:focus-within": { borderColor: "text.secondary" },
        }}
      >
        <InputBase
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Buscar publicações, perfis e hashtags"
          fullWidth
          inputProps={{ maxLength: 80, "aria-label": "Buscar na comunidade" }}
          sx={{ fontSize: 14, p: 0, "& input": { p: 0 } }}
        />
        <ButtonBase type="submit" aria-label="Buscar" sx={{ color: "text.primary", minWidth: 32, minHeight: 32, borderRadius: "6px" }}>
          <SearchIcon sx={{ fontSize: 18 }} />
        </ButtonBase>
      </Box>
    </Box>
  );
}
