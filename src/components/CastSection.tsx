"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Box, MenuItem, Select, Stack, Typography } from "@mui/material";
import type { AniListCharacterEntry } from "@/lib/anilist";

type CastMember = AniListCharacterEntry;

/** Ordena japonês primeiro (dublagem original, quase sempre a mais
 * completa), depois o resto em ordem alfabética. */
function sortLanguages(languages: string[]): string[] {
  return [...languages].sort((a, b) => {
    if (a === "Japanese") return -1;
    if (b === "Japanese") return 1;
    return a.localeCompare(b);
  });
}

/**
 * Elenco de dublagem (Epic 14) — a AniList já manda todas as línguas de
 * dublagem que conhece numa consulta só; o seletor de idioma só filtra no
 * cliente, sem nova requisição.
 */
export function CastSection({ cast }: { cast: CastMember[] }) {
  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const member of cast) {
      for (const va of member.voiceActors) set.add(va.language);
    }
    return sortLanguages(Array.from(set));
  }, [cast]);

  const [language, setLanguage] = useState<string | null>(null);
  const activeLanguage = language ?? languages[0];

  if (languages.length === 0 || !activeLanguage) return null;

  const visibleCast = cast.filter((member) =>
    member.voiceActors.some((va) => va.language === activeLanguage)
  );

  return (
    <Box>
      {languages.length > 1 && (
        <Select
          value={activeLanguage}
          onChange={(e) => setLanguage(e.target.value)}
          size="small"
          aria-label="Idioma de dublagem"
          sx={{ mb: 2, minWidth: 160 }}
        >
          {languages.map((lang) => (
            <MenuItem key={lang} value={lang}>
              {lang}
            </MenuItem>
          ))}
        </Select>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(1, 1fr)", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
          gap: 2,
        }}
      >
        {visibleCast.map((member, index) => {
          const va = member.voiceActors.find((v) => v.language === activeLanguage);
          return (
            <Stack key={`${member.role}-${index}`} direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
              <Box
                sx={{
                  position: "relative",
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: "50%",
                  overflow: "hidden",
                  bgcolor: "background.paper",
                }}
              >
                {member.image && (
                  <Image src={member.image} alt="" fill sizes="44px" style={{ objectFit: "cover" }} />
                )}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {member.name}
                </Typography>
                {va && (
                  <Typography variant="caption" noWrap sx={{ display: "block", color: "text.secondary" }}>
                    {va.name}
                  </Typography>
                )}
              </Box>
            </Stack>
          );
        })}
      </Box>
    </Box>
  );
}
