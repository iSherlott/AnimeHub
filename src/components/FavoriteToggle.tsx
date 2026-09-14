"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { IconButton, Tooltip, type SxProps, type Theme } from "@mui/material";

export function FavoriteToggle({
  animeId,
  initialFavorite,
  size = "medium",
  sx,
}: {
  animeId: string;
  initialFavorite: boolean;
  /** "small" pro selo sobreposto num card compacto (ver AnimeCard, que
   * usa o mesmo tamanho do selo de "adicionar" do DiscoverCard) — o botão
   * solto da página de detalhe continua "medium". */
  size?: "small" | "medium";
  /** Pra reuso como selo sobreposto num card (ver AnimeCard) — sobrescreve
   * o posicionamento/fundo padrão do botão solto da página de detalhe. */
  sx?: SxProps<Theme>;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [saving, setSaving] = useState(false);

  async function toggle(e: React.MouseEvent) {
    // Defensivo: se algum dia FavoriteToggle for usado aninhado dentro de
    // um link/CardActionArea clicável (hoje o AnimeCard o coloca como
    // irmão, não filho, então não é estritamente necessário ali), isso
    // evita que o clique também dispare a navegação do ancestral.
    e.preventDefault();
    e.stopPropagation();
    const next = !isFavorite;
    setIsFavorite(next);
    setSaving(true);
    try {
      await fetch(`/api/anime/${animeId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const label = isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos";

  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          onClick={toggle}
          disabled={saving}
          aria-label={label}
          size={size}
          sx={
            [
              { color: isFavorite ? "secondary.main" : "text.secondary" },
              // No selo pequeno sobreposto ao card, o anel de foco global
              // (#ffd400, muiTheme.ts) fica quase indistinguível da própria
              // estrela dourada já favoritada — achado real da auditoria
              // (Epic 20/21). Só nesse tamanho, branco no lugar de dourado;
              // o botão solto "medium" da página de detalhe tem contexto de
              // sobra e continua usando o anel padrão do tema.
              ...(size === "small"
                ? [{ "&.Mui-focusVisible": { outline: "2px solid #f7f7f5" } }]
                : []),
              ...(sx ? [sx] : []),
            ] as SxProps<Theme>
          }
        >
          {isFavorite ? (
            <StarIcon fontSize={size} />
          ) : (
            <StarBorderIcon fontSize={size} />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
