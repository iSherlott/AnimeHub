"use client";

import Image from "next/image";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Box, Chip, Typography } from "@mui/material";
import type { Episode } from "@prisma/client";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";

function EpisodeTile({
  ep,
  fallbackImage,
  watched,
}: {
  ep: Episode;
  fallbackImage?: string | null;
  watched: boolean;
}) {
  const { preference } = useTitlePreference();
  // Ao contrário do Anime, nem todo episódio tem os 3 campos preenchidos
  // (Kitsu/AniDB às vezes só trazem um) — resolveTitleTextLenient degrada
  // pelos campos de verdade, em vez de fingir que um deles é romaji.
  const title = resolveTitleTextLenient(
    preference,
    { titleRomaji: ep.titleRomaji, titleEnglish: ep.titleEnglish, titleNative: ep.titleJapanese },
    `Episódio ${ep.number}`
  );
  const image = ep.thumbnail ?? fallbackImage;

  return (
    <Box
      data-testid={`episode-tile-${ep.seasonNumber}-${ep.number}`}
      title={ep.titleJapanese ? `${title} — ${ep.titleJapanese}` : title}
      sx={{ overflow: "hidden", border: 1, borderColor: "divider", bgcolor: "background.paper" }}
    >
      <Box sx={{ position: "relative", aspectRatio: "16 / 9", width: "100%", overflow: "hidden", bgcolor: "background.default" }}>
        {image ? (
          <Image
            src={image}
            alt={title}
            fill
            sizes="240px"
            style={{ objectFit: "cover", opacity: watched ? 0.45 : 1 }}
          />
        ) : (
          <Box sx={{ display: "flex", height: "100%", width: "100%", alignItems: "center", justifyContent: "center", opacity: watched ? 0.45 : 1 }}>
            <Typography className="font-display" sx={{ fontSize: 28, color: "text.secondary" }}>
              {ep.number}
            </Typography>
          </Box>
        )}
        <Chip
          label={`EP ${ep.number}`}
          size="small"
          sx={{ position: "absolute", left: 6, top: 6, height: 20, fontSize: 10, fontWeight: 700, bgcolor: "rgba(11,11,13,0.85)", color: "primary.main" }}
        />
        {watched && (
          <Box
            role="img"
            aria-label="Já assistido"
            sx={{
              position: "absolute",
              right: 6,
              top: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              bgcolor: "rgba(11,11,13,0.85)",
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 20, color: "success.main" }} />
          </Box>
        )}
      </Box>
      <Typography noWrap variant="body2" sx={{ p: 1, fontWeight: 500, color: watched ? "text.secondary" : "text.primary" }}>
        {title}
      </Typography>
    </Box>
  );
}

export function EpisodeGrid({
  episodes,
  fallbackImage,
  watchedCount,
}: {
  episodes: Episode[];
  /** Capa do anime — mostrada no lugar da miniatura quando a fonte não traz
   * uma imagem por episódio (em vez de deixar o quadro vazio). */
  fallbackImage?: string | null;
  /** WatchProgress.episodeProgress — contagem simples de episódios
   * assistidos, sem relação com o `number` de cada episódio dentro da sua
   * própria temporada (que reinicia a cada uma). Pra marcar o episódio
   * certo como assistido mesmo com várias temporadas, ordena tudo por
   * (temporada, número) e compara contra a posição nessa ordem — não
   * contra o número bruto do episódio. */
  watchedCount?: number;
}) {
  if (episodes.length === 0) return null;

  const ordinalByEpisodeId = new Map<string, number>();
  [...episodes]
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.number - b.number)
    .forEach((ep, i) => ordinalByEpisodeId.set(ep.id, i + 1));
  const isWatched = (ep: Episode) =>
    typeof watchedCount === "number" && (ordinalByEpisodeId.get(ep.id) ?? Infinity) <= watchedCount;

  const seasonNumbers = Array.from(new Set(episodes.map((ep) => ep.seasonNumber))).sort(
    (a, b) => a - b
  );

  const gridSx = {
    display: "grid",
    gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)", lg: "repeat(5, 1fr)" },
    gap: 1.5,
  } as const;

  if (seasonNumbers.length <= 1) {
    return (
      <Box sx={gridSx}>
        {episodes.map((ep) => (
          <EpisodeTile key={ep.id} ep={ep} fallbackImage={fallbackImage} watched={isWatched(ep)} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {seasonNumbers.map((seasonNumber) => (
        <Box key={seasonNumber}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <Box sx={{ width: 4, height: 12, bgcolor: "primary.main", transform: "skewX(-12deg)" }} />
            <Typography variant="body2" className="font-display" sx={{ textTransform: "uppercase", color: "text.secondary" }}>
              Temporada {seasonNumber}
            </Typography>
          </Box>
          <Box sx={gridSx}>
            {episodes
              .filter((ep) => ep.seasonNumber === seasonNumber)
              .map((ep) => (
                <EpisodeTile key={ep.id} ep={ep} fallbackImage={fallbackImage} watched={isWatched(ep)} />
              ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
