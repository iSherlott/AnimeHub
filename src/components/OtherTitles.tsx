"use client";

import { useState } from "react";
import { Box, Button, Typography } from "@mui/material";

type TitleEntry = { language: string; title: string; isOfficial: boolean };

const LANGUAGE_LABELS: Record<string, string> = {
  "x-jat": "Romaji",
  ja: "Japonês",
  en: "Inglês",
  pt: "Português",
  "pt-br": "Português (BR)",
  de: "Alemão",
  fr: "Francês",
  es: "Espanhol",
  it: "Italiano",
  ru: "Russo",
  ko: "Coreano",
  zh: "Chinês",
};

export function OtherTitles({ titlesJson }: { titlesJson: string | null }) {
  const [open, setOpen] = useState(false);
  if (!titlesJson) return null;

  let titles: TitleEntry[] = [];
  try {
    titles = JSON.parse(titlesJson);
  } catch {
    return null;
  }
  if (titles.length === 0) return null;

  return (
    <Box>
      <Button
        onClick={() => setOpen((v) => !v)}
        size="small"
        sx={{ px: 0, minWidth: 0, fontSize: 12, fontWeight: 400, textTransform: "none", color: "text.secondary", "&:hover": { textDecoration: "underline", bgcolor: "transparent" } }}
      >
        {open ? "▾" : "▸"} Outros títulos ({titles.length}) — via AniDB
      </Button>
      {open && (
        <Box
          component="ul"
          sx={{
            mt: 1,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 0.5,
            borderLeft: 2,
            borderColor: "divider",
            pl: 1.5,
            listStyle: "none",
            m: 0,
          }}
        >
          {titles.map((t, i) => (
            <Typography component="li" key={i} variant="caption" sx={{ color: "text.secondary" }}>
              <Box component="span" sx={{ color: "text.disabled" }}>
                {LANGUAGE_LABELS[t.language] ?? t.language}:
              </Box>{" "}
              {t.title}
              {t.isOfficial && (
                <Box component="span" sx={{ ml: 0.5, color: "secondary.main" }}>
                  ★
                </Box>
              )}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}
