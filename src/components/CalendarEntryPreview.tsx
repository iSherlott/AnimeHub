"use client";

import { useEffect, useState } from "react";
import { isAiringNow } from "@/lib/airingWindow";
import Image from "next/image";
import NextLink from "next/link";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import CheckIcon from "@mui/icons-material/Check";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import { useSynopsis } from "@/components/SynopsisText";
import { Box, Button, Typography } from "@mui/material";
import type { CalendarItem } from "@/lib/calendarItem";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { loginHref } from "@/lib/safeRedirect";
import { formatTimeInZone, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

const buttonSx = { bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } };

/**
 * Conteúdo do preview ao passar o mouse (ou focar) num item do calendário
 * (Figma `28:1940`): capa com o selo de novo episódio, títulos, dia/horário,
 * sinopse, gêneros e as ações Ver detalhes / + Acompanhar. O `Popover` em si
 * (abertura por hover, delay de saída) vive em CalendarEntryCard.tsx.
 */
export function CalendarEntryPreview({ item, onFollowed }: { item: CalendarItem; onFollowed?: (anilistId: number, animeId: string) => void }) {
  const { preference } = useTitlePreference();
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const title = resolveTitleText(preference, item) || "Sem título";
  const description = useSynopsis(item.description, item.anilistId, item.descriptionPortuguese);
  const [coverBroken, setCoverBroken] = useState(false);
  const hasImage = Boolean(item.episodeImage ?? item.coverImage) && !coverBroken;

  // Acompanhar daqui adiciona direto à lista (sem abrir a página da obra).
  const [followedId, setFollowedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const animeId = item.inMyList && item.animeId ? item.animeId : followedId;
  const isInternal = Boolean(animeId);
  const detailHref = animeId ? `/anime/${animeId}` : `/obra/${item.anilistId}`;

  async function follow() {
    setFollowing(true);
    setFollowError(null);
    try {
      const res = await fetch("/api/anime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anilistId: item.anilistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFollowError(data.error ?? "Não foi possível acompanhar. Tente novamente.");
        return;
      }
      const id = data.anime?.id as string | undefined;
      if (id) {
        setFollowedId(id);
        onFollowed?.(item.anilistId, id);
      }
    } finally {
      setFollowing(false);
    }
  }

  const airing = new Date(item.airingAt);
  // Só no navegador (o relógio do servidor pode divergir do cliente na borda da janela).
  const [live, setLive] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive(isAiringNow(item.airingAt));
  }, [item.airingAt]);
  const weekday = weekdayName(airing, timeZone);
  const secondary = [item.titleNative && title !== item.titleNative ? item.titleNative : null, title !== item.titleRomaji ? item.titleRomaji : null, item.titleEnglish && title !== item.titleEnglish ? item.titleEnglish : null].filter(Boolean)[0];
  // Favorito: sobreposto ao canto superior direito da imagem; sem imagem, volta para a fileira de ações.
  const favorite = isInternal ? (
    <FavoriteToggle
      animeId={animeId!}
      initialFavorite={followedId ? false : item.isFavorite}
      size="small"
      sx={hasImage ? { position: "absolute", top: 8, right: 8, bgcolor: "rgba(8,8,11,0.72)", "&:hover": { bgcolor: "rgba(8,8,11,0.88)" } } : undefined}
    />
  ) : null;
  const tertiary = item.titleEnglish && item.titleEnglish !== title && item.titleEnglish !== secondary ? item.titleEnglish : null;

  return (
    <Box sx={{ width: 320, display: "flex", flexDirection: "column" }} data-testid="calendar-preview">
      {(item.episodeImage ?? item.coverImage) && !coverBroken && (
        <Box sx={{ position: "relative", height: 180, overflow: "hidden", bgcolor: "background.default" }}>
          <Image
            src={(item.episodeImage ?? item.coverImage) as string}
            alt=""
            fill
            sizes="320px"
            style={{ objectFit: "cover", objectPosition: "center 25%" }}
            onError={() => setCoverBroken(true)}
          />
          {favorite && (
            <Box data-testid="preview-favorite-overlay" sx={{ position: "absolute", top: 0, right: 0, zIndex: 1, width: 48, height: 48 }}>
              {favorite}
            </Box>
          )}
          {live && (
            <Box sx={{ position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 1, px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#2c111b", color: "primary.main" }}>
              <FiberManualRecordIcon sx={{ fontSize: 12 }} />
              <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "inherit" }}>
                AO VIVO
              </Typography>
            </Box>
          )}
        </Box>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Typography lang={item.titleNative && title === item.titleNative ? "ja" : undefined} sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>
            {title}
          </Typography>
          {secondary && (
            <Typography lang={secondary === item.titleNative ? "ja" : undefined} sx={{ fontSize: 11, color: "text.secondary" }}>
              {secondary}
            </Typography>
          )}
          {tertiary && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{tertiary}</Typography>}
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, color: "text.primary" }}>
            <EventRepeatIcon sx={{ fontSize: 16 }} />
            <Typography suppressHydrationWarning component="span" sx={{ fontSize: 11, fontWeight: 700 }}>
              {weekday} · {formatTimeInZone(airing, timeZone)}
            </Typography>
          </Box>
        </Box>

        {item.description ? (
          <Typography
            sx={{
              fontSize: 12,
              lineHeight: 1.6,
              color: "text.secondary",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {description}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {item.inMyList ? "Sem sinopse salva." : "Sem sinopse — abra pra ver mais."}
          </Typography>
        )}

        {item.genres.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {item.genres.slice(0, 3).map((genre) => (
              <Typography
                key={genre}
                component="span"
                sx={{ px: 1, py: 0.5, borderRadius: "6px", bgcolor: "background.paper", fontSize: 10, fontWeight: 700 }}
              >
                {genre}
              </Typography>
            ))}
          </Box>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button component={NextLink} href={detailHref} size="small" startIcon={<ArrowOutwardIcon />} sx={buttonSx}>
            Ver detalhes
          </Button>
          {isInternal ? (
            <>
              {followedId && (
                <Button component={NextLink} href={`/anime/${followedId}`} size="small" startIcon={<CheckIcon />} sx={buttonSx} data-testid="preview-following">
                  Acompanhando
                </Button>
              )}
              {!hasImage && favorite}
            </>
          ) : user ? (
            <Button variant="contained" size="small" disabled={following} onClick={() => void follow()} data-testid="preview-follow">
              {following ? "Adicionando…" : "+ Acompanhar"}
            </Button>
          ) : (
            <Button component={NextLink} href={loginHref(detailHref)} variant="contained" size="small">
              + Acompanhar
            </Button>
          )}
        </Box>
        {followError && (
          <Typography role="alert" sx={{ fontSize: 11, color: "primary.main" }}>
            {followError}
          </Typography>
        )}
        {!isInternal && user === null && (
          <Typography sx={{ fontSize: 10, color: "text.secondary", textAlign: "center" }}>Acompanhar requer login</Typography>
        )}
      </Box>
    </Box>
  );
}
