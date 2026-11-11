"use client";

import TranslateIcon from "@mui/icons-material/Translate";
import { Box, ButtonBase, Typography } from "@mui/material";

const LABELS: Record<string, string> = { pt: "Português", en: "English", ja: "日本語" };
const ORDER = ["pt", "en", "ja"];

/**
 * Troca o idioma da notícia (11/11/2026): o Feed abre em português e aqui a pessoa passa para o inglês ou o japonês.
 * O original vem marcado; o resto é tradução automática.
 */
export function PostLanguageSwitch({ original, available, value, onChange }: { original: string; available: string[]; value: string; onChange: (lang: string) => void }) {
  const langs = ORDER.filter((l) => available.includes(l));
  return (
    <Box role="group" aria-label="Idioma da notícia" data-testid="post-language" sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
      <TranslateIcon aria-hidden sx={{ fontSize: 16, color: "text.secondary" }} />
      {langs.map((l) => {
        const active = l === value;
        return (
          <ButtonBase
            key={l}
            onClick={() => onChange(l)}
            aria-pressed={active}
            data-testid={`post-lang-${l}`}
            lang={l}
            sx={{
              px: 1,
              py: 0.25,
              minHeight: 28,
              borderRadius: "999px",
              border: 1,
              borderColor: active ? "secondary.main" : "divider",
              color: active ? "text.primary" : "text.secondary",
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              "&:hover": { color: "text.primary" },
              "&:focus-visible": { outline: "2px solid", outlineColor: "secondary.main" },
            }}
          >
            {LABELS[l] ?? l}
          </ButtonBase>
        );
      })}
      <Typography component="span" sx={{ fontSize: 11, color: "text.secondary" }}>
        {value === original ? "original" : "tradução automática"}
      </Typography>
    </Box>
  );
}
