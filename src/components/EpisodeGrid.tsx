"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import type { Episode } from "@prisma/client";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";
import { useTimeZone } from "@/lib/useTimeZone";

/** "05 out 2026 · 10:00" (com horário, quando vem do calendário) ou só o dia. */
function formatRelease(value: Date | string, timeZone: string, withTime: boolean): string {
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: withTime ? timeZone : "UTC", day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value))
    .replace(/\./g, "")
    .replace(/ de /g, " ");
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return `${date} · ${time}`;
}

function EpisodeRow({ ep, fallbackImage, airingAt, calendarImage }: { ep: Episode; fallbackImage?: string | null; airingAt?: string; calendarImage?: string }) {
  const { preference } = useTitlePreference();
  const timeZone = useTimeZone();
  // Ao contrário do Anime, nem todo episódio tem os 3 campos preenchidos
  // (Kitsu/AniDB às vezes só trazem um) — resolveTitleTextLenient degrada
  // pelos campos de verdade, em vez de fingir que um deles é romaji.
  const title = resolveTitleTextLenient(
    preference,
    { titleRomaji: ep.titleRomaji, titleEnglish: ep.titleEnglish, titleNative: ep.titleJapanese },
    `Episódio ${ep.number}`
  );
  // Imagem do episódio: a da Kitsu, senão a capturada para o calendário, senão a capa do anime.
  const image = ep.thumbnail ?? calendarImage ?? fallbackImage;
  // Lançamento: o horário do calendário (preciso) ou, na falta dele, o dia informado pela Kitsu.
  const release = airingAt ? formatRelease(airingAt, timeZone, true) : ep.airDate ? formatRelease(ep.airDate, timeZone, false) : null;
  // Ver AnimeCard — mesma correção pro ícone quebrado cru numa URL de
  // imagem que 404 (achado real da 6ª rodada de auditoria, Epic 18).
  const [broken, setBroken] = useState(false);
  const [showSynopsis, setShowSynopsis] = useState(false);

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
          sx={{ fontWeight: 700, color: "text.primary" }}
        >
          EP {ep.number} · {title}
        </Typography>
        <Typography data-testid={`episode-release-${ep.seasonNumber}-${ep.number}`} variant="caption" suppressHydrationWarning sx={{ color: "text.secondary" }}>
          {release ? `Lançamento: ${release}` : "Lançamento: data a confirmar"}
        </Typography>
        {!ep.synopsis && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Sem sinopse disponível para este episódio.
          </Typography>
        )}
        {ep.synopsis && (
          // Sinopse de episódio pode entregar a trama: só aparece por ação
          // explícita (D-09, P-12).
          <>
            <Button
              onClick={() => setShowSynopsis((v) => !v)}
              size="small"
              aria-expanded={showSynopsis}
              sx={{ px: 0, minWidth: 0, textTransform: "none", justifyContent: "flex-start", alignSelf: "flex-start" }}
            >
              {showSynopsis ? "Ocultar sinopse" : "Mostrar sinopse (pode conter spoilers)"}
            </Button>
            {showSynopsis && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {ep.synopsis}
              </Typography>
            )}
          </>
        )}
      </Box>

    </Stack>
  );
}

/** Episódio que só existe no calendário (a Kitsu ainda não o lista): número, data e imagem, sem texto inventado. */
function scheduledOnly(number: number, seasonNumber: number): Episode {
  return { id: `sched-${number}`, animeId: "", number, seasonNumber, titleRomaji: null, titleEnglish: null, titleJapanese: null, synopsis: null, thumbnail: null, airDate: null, createdAt: new Date(0) } as Episode;
}

export function EpisodeGrid({
  episodes: kitsuEpisodes,
  schedule = {},
  episodeImages = {},
  fallbackImage,
  accentColor,
}: {
  episodes: Episode[];
  /** Número do episódio → horário de exibição (calendário). */
  schedule?: Record<number, string>;
  /** Número do episódio → imagem capturada para o calendário. */
  episodeImages?: Record<number, string>;
  /** Capa do anime — mostrada no lugar da miniatura quando a fonte não traz
   * uma imagem por episódio (em vez de deixar o quadro vazio). */
  fallbackImage?: string | null;
  /** Cor de destaque do anime — usada no cabeçalho do accordion. */
  accentColor?: string | null;
}) {
  // Episódios agendados que a Kitsu ainda não lista entram na lista (só com número, data e imagem).
  const episodes = useMemo(() => {
    const seasons = Array.from(new Set(kitsuEpisodes.map((e) => e.seasonNumber)));
    if (seasons.length > 1) return kitsuEpisodes; // várias temporadas: o número do calendário seria ambíguo
    const have = new Set(kitsuEpisodes.map((e) => e.number));
    const extra = Object.keys(schedule)
      .map(Number)
      .filter((n) => !have.has(n))
      .map((n) => scheduledOnly(n, seasons[0] ?? 1));
    return [...kitsuEpisodes, ...extra];
  }, [kitsuEpisodes, schedule]);

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
    <Accordion
      disableGutters
      sx={{ bgcolor: "background.paper", "&:before": { display: "none" } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: accentColor ?? undefined }} />}
        aria-label={`Ver episódios (${episodes.length})`}
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Ver episódios ({episodes.length})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
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
                <EpisodeRow key={ep.id} ep={ep} fallbackImage={fallbackImage} airingAt={schedule[ep.number]} calendarImage={episodeImages[ep.number]} />
              ))}
            </Box>
          )}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
