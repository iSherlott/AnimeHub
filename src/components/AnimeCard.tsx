"use client";

import NextLink from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Box, Card, CardActionArea, Tooltip, Typography } from "@mui/material";
import { resolveTitleText, useTitlePreference, type TitleSet } from "@/lib/titlePreference";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { LocalDateTime } from "@/components/LocalDateTime";

/**
 * Card de uma obra acompanhada. Mostra só o que a agenda precisa: capa,
 * título e o PRÓXIMO lançamento confirmado. Nenhuma métrica de consumo
 * (episódios assistidos, status, barra de progresso) — o produto "registra
 * interesse, não consumo" (P-3, D-02).
 */
export type AnimeCardData = {
  id: string | number;
  href: string;
  titles: TitleSet;
  coverImage: string | null;
  isFavorite?: boolean;
  /** Próximo episódio com data confirmada (ISO), se houver. */
  next?: { airingAt: string; episode: number } | null;
};

export function AnimeCard({ id, href, titles, coverImage, isFavorite, next }: AnimeCardData) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, titles);
  // Uma URL de capa que 404 (dado sujo vindo de fonte externa) renderizava
  // o ícone quebrado cru do navegador em vez do mesmo placeholder já usado
  // pra "sem capa nenhuma" — achado real da 6ª rodada de auditoria, Epic 18.
  const [coverBroken, setCoverBroken] = useState(false);

  return (
    <Card data-testid={`anime-card-${id}`} sx={{ position: "relative", width: { xs: 144, sm: 176 }, flexShrink: 0 }}>
      <Tooltip title={title}>
        <CardActionArea component={NextLink} href={href}>
          <Box sx={{ position: "relative", aspectRatio: "2 / 3", width: "100%", overflow: "hidden" }}>
            {coverImage && !coverBroken ? (
              <Image
                src={coverImage}
                alt=""
                fill
                sizes="192px"
                style={{ objectFit: "cover" }}
                onError={() => setCoverBroken(true)}
              />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  height: "100%",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "background.paper",
                  px: 1,
                  textAlign: "center",
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {title}
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ p: 1 }}>
            <Typography variant="body2" noWrap>
              {title}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }} data-testid="card-next">
              {next ? (
                <>
                  EP {next.episode} · <LocalDateTime iso={next.airingAt} compact />
                </>
              ) : (
                "Sem previsão confirmada"
              )}
            </Typography>
          </Box>
        </CardActionArea>
      </Tooltip>
      {typeof isFavorite === "boolean" && (
        <FavoriteToggle
          animeId={String(id)}
          initialFavorite={isFavorite}
          size="small"
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            bgcolor: "rgba(0,0,0,0.7)",
            "&:hover": { bgcolor: "rgba(0,0,0,0.85)" },
          }}
        />
      )}
    </Card>
  );
}
