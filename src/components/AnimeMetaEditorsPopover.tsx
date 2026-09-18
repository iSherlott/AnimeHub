"use client";

import { useState, type MouseEvent } from "react";
import EditIcon from "@mui/icons-material/Edit";
import { IconButton, Popover, Stack, Tooltip } from "@mui/material";
import { SeriesGroupEditor } from "@/components/SeriesGroupEditor";
import { TitleEditor } from "@/components/TitleEditor";
import { AnidbIdEditor } from "@/components/AnidbIdEditor";
import { DescriptionEditor } from "@/components/DescriptionEditor";

/**
 * Casca visual pros 4 editores de metadado (agrupamento de temporada,
 * título/descrição em português, ID da AniDB) — antes cada um era um botão
 * de texto sempre visível, disputando espaço com o seletor de temporada e o
 * botão de atualizar dados; agora ficam atrás de 1 ícone discreto. Cada
 * editor mantém sua própria lógica de salvar/cancelar (InlineEditField) sem
 * nenhuma mudança — só a apresentação externa mudou.
 */
export function AnimeMetaEditorsPopover({
  animeId,
  seriesKey,
  seasonNumber,
  titlePortuguese,
  descriptionPortuguese,
  anidbId,
}: {
  animeId: string;
  seriesKey: string;
  seasonNumber: number;
  titlePortuguese: string | null;
  descriptionPortuguese: string | null;
  anidbId: number | null;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  function handleOpen(e: MouseEvent<HTMLElement>) {
    setAnchorEl(e.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  return (
    <>
      <Tooltip title="Editar metadados">
        <IconButton
          onClick={handleOpen}
          size="small"
          aria-label="Editar metadados"
          sx={{ color: "text.secondary" }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Stack spacing={1} sx={{ p: 2, alignItems: "flex-start", maxWidth: 360 }}>
          <SeriesGroupEditor animeId={animeId} seriesKey={seriesKey} seasonNumber={seasonNumber} />
          <TitleEditor animeId={animeId} titlePortuguese={titlePortuguese} />
          <DescriptionEditor animeId={animeId} descriptionPortuguese={descriptionPortuguese} />
          <AnidbIdEditor animeId={animeId} anidbId={anidbId} />
        </Stack>
      </Popover>
    </>
  );
}
