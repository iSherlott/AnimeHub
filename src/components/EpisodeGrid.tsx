"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Box, MenuItem, Select, Stack, TextField, Typography, type SelectChangeEvent } from "@mui/material";
import type { Episode } from "@prisma/client";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";

function EpisodeRow({
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
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de
  // imagem que 404 (achado real da 6ª rodada de auditoria, Epic 18).
  const [broken, setBroken] = useState(false);

  return (
    <Stack
      data-testid={`episode-tile-${ep.seasonNumber}-${ep.number}`}
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: "stretch",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        opacity: watched ? 0.6 : 1,
      }}
    >
      <Box
        sx={{
          position: "relative",
          flexShrink: 0,
          width: { xs: 112, sm: 160 },
          aspectRatio: "16 / 9",
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        {image && !broken ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="160px"
            style={{ objectFit: "cover" }}
            onError={() => setBroken(true)}
          />
        ) : (
          <Box sx={{ display: "flex", height: "100%", width: "100%", alignItems: "center", justifyContent: "center" }}>
            <Typography className="font-display" sx={{ fontSize: 22, color: "text.secondary" }}>
              {ep.number}
            </Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", py: 1, pr: 1.5, gap: 0.25 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: watched ? "text.secondary" : "text.primary" }}
        >
          EP {ep.number} · {title}
        </Typography>
        {ep.synopsis && (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {ep.synopsis}
          </Typography>
        )}
      </Box>

      {watched && (
        <Box
          role="img"
          aria-label="Já assistido"
          sx={{ display: "flex", alignItems: "center", pr: 1.5, flexShrink: 0 }}
        >
          <CheckCircleIcon sx={{ fontSize: 20, color: "success.main" }} />
        </Box>
      )}
    </Stack>
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
  const seasonNumbers = useMemo(
    () => Array.from(new Set(episodes.map((ep) => ep.seasonNumber))).sort((a, b) => a - b),
    [episodes]
  );
  // `null` = "ainda sigo a temporada mais recente automaticamente" (usuário
  // não mexeu no seletor) — nunca um `useState` inicializado 1 vez só com a
  // última temporada de então, que ficava presa nesse valor pra sempre
  // depois de "Atualizar dados" trazer uma temporada nova, já que esse
  // componente não remonta nesse fluxo (achado real da revisão de código do
  // redesenho da lista de episódios). `effectiveSeason` recalcula a cada
  // render a partir do `seasonNumbers` atual.
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const mostRecentSeason = seasonNumbers[seasonNumbers.length - 1];
  const effectiveSeason = seasonNumbers.length > 1 ? (selectedSeason ?? mostRecentSeason) : null;
  const [query, setQuery] = useState("");

  if (episodes.length === 0) return null;

  const ordinalByEpisodeId = new Map<string, number>();
  [...episodes]
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.number - b.number)
    .forEach((ep, i) => ordinalByEpisodeId.set(ep.id, i + 1));
  const isWatched = (ep: Episode) =>
    typeof watchedCount === "number" && (ordinalByEpisodeId.get(ep.id) ?? Infinity) <= watchedCount;

  const needle = query.trim().toLowerCase();
  const visibleEpisodes = episodes
    .filter((ep) => effectiveSeason === null || ep.seasonNumber === effectiveSeason)
    .filter((ep) => {
      if (!needle) return true;
      const haystack = [ep.titleRomaji, ep.titleEnglish, ep.titleJapanese, String(ep.number)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .sort((a, b) => a.number - b.number);

  function handleSeasonChange(e: SelectChangeEvent<number>) {
    setSelectedSeason(Number(e.target.value));
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {seasonNumbers.length > 1 && (
          <Select value={effectiveSeason ?? mostRecentSeason} onChange={handleSeasonChange} size="small" aria-label="Temporada">
            {seasonNumbers.map((s) => (
              <MenuItem key={s} value={s}>
                Temporada {s}
              </MenuItem>
            ))}
          </Select>
        )}
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar episódio..."
          size="small"
          sx={{ minWidth: 200, flex: { xs: 1, sm: "unset" } }}
        />
      </Stack>

      {visibleEpisodes.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Nenhum episódio bate com essa busca.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {visibleEpisodes.map((ep) => (
            <EpisodeRow key={ep.id} ep={ep} fallbackImage={fallbackImage} watched={isWatched(ep)} />
          ))}
        </Box>
      )}
    </Box>
  );
}
