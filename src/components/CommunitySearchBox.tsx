"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

/**
 * Entrada da busca social (SOC-004): leva para `/buscar?q=…&scope=posts`.
 * Uma busca é uma navegação de verdade, então voltar do navegador restaura
 * a consulta e o escopo (SOC-005).
 */
export function CommunitySearchBox({ initialQuery = "", scope = "posts" }: { initialQuery?: string; scope?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/buscar?${new URLSearchParams({ q, scope }).toString()}`);
  }

  return (
    <form onSubmit={submit} role="search" aria-label="Buscar na comunidade">
      <TextField
        fullWidth
        size="small"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar publicações, perfis e hashtags"
        slotProps={{
          htmlInput: { "aria-label": "Buscar na comunidade", maxLength: 80 },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton type="submit" aria-label="Buscar" edge="end" size="small">
                  <SearchIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    </form>
  );
}
