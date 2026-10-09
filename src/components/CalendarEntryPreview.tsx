"use client";

import { useState } from "react";
import Image from "next/image";
import NextLink from "next/link";
import { htmlToPlainText } from "@/lib/plainText";
import { Box, Link as MuiLink, Typography } from "@mui/material";
import type { CalendarItem } from "@/lib/calendarItem";
import { resolveTitleText, useLocalizedDescription, useTitlePreference } from "@/lib/titlePreference";
import { FavoriteToggle } from "@/components/FavoriteToggle";

/**
 * Conteúdo do preview que aparece ao passar o mouse em cima de uma entrada
 * do calendário (lote 2 do Epic 27) — o `Popover` em si (aberto/fechado por
 * hover, com o delay de saída) vive em CalendarEntryCard.tsx, que é quem
 * sabe de onde veio o hover; este componente só sabe renderizar o `item`.
 */
export function CalendarEntryPreview({ item }: { item: CalendarItem }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, item) || "Sem título";
  const description = useLocalizedDescription(item.description ?? "", item.descriptionPortuguese);
  const [coverBroken, setCoverBroken] = useState(false);

  const isInternal = Boolean(item.inMyList && item.animeId);
  const detailHref = isInternal ? `/anime/${item.animeId}` : `/obra/${item.anilistId}`;

  return (
    <Box sx={{ display: "flex", gap: 1.5, p: 1.5, maxWidth: 320 }}>
      <Box sx={{ position: "relative", width: 80, height: 112, flexShrink: 0, overflow: "hidden", bgcolor: "background.default" }}>
        {item.coverImage && !coverBroken ? (
          <Image
            src={item.coverImage}
            alt=""
            fill
            sizes="80px"
            style={{ objectFit: "cover" }}
            onError={() => setCoverBroken(true)}
          />
        ) : null}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Typography
          variant="subtitle2"
          className="font-display"
          sx={{
            textTransform: "uppercase",
            lineHeight: 1.25,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </Typography>

        {item.description ? (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {htmlToPlainText(description)}
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {item.inMyList ? "Sem sinopse salva." : "Sem sinopse — abra pra ver mais."}
          </Typography>
        )}

        <Box sx={{ mt: "auto", pt: 0.5 }}>
          {isInternal ? (
            <FavoriteToggle animeId={item.animeId!} initialFavorite={item.isFavorite} size="small" />
          ) : (
            <MuiLink
              component={NextLink}
              href={detailHref}
              variant="caption"
              sx={{ fontWeight: 700 }}
            >
              Ver mais detalhes
            </MuiLink>
          )}
        </Box>
      </Box>
    </Box>
  );
}
