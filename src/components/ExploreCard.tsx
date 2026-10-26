"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import ScheduleIcon from "@mui/icons-material/Schedule";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { Box, IconButton, Link as MuiLink, Typography } from "@mui/material";
import { CoverImage } from "@/components/CoverImage";
import type { DiscoverItem } from "@/lib/discoverItem";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { scheduleOf } from "@/lib/exploreGroups";
import { loginHref } from "@/lib/safeRedirect";
import { resolveTitleText, useTitlePreference, type TitleSet } from "@/lib/titlePreference";
import { sanitizeFuriganaHtml } from "@/lib/plainText";
import { useReading } from "@/lib/useReadings";
import { formatTimeInZone, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";
import { CATALOG_ONLY_SLUG, workHref } from "@/lib/workHref";

export const ELEVATED_BUTTON_SX = {
  bgcolor: "#171820",
  color: "text.primary",
  border: 1,
  borderColor: "divider",
  "&:hover": { bgcolor: "#1d1e28" },
} as const;

/** "Sábado · 13:00" / "11 out · Horário não definido" / "Data não definida" — nunca inventa horário. */
export function useScheduleText(item: DiscoverItem): { text: string; icon: "clock" | "calendar-x" | "calendar-clock" | "check" } {
  const timeZone = useTimeZone();
  // Episódio de hoje: mostra o horário mesmo depois de ele ter ido ao ar ("Hoje · 13:00"), nunca "data não definida".
  if (item.airingToday && item.nextEpisodeAt) {
    return { text: `Hoje · ${formatTimeInZone(new Date(item.nextEpisodeAt), timeZone)}`, icon: "clock" };
  }
  const info = scheduleOf(item);
  if (info.kind === "scheduled") {
    const d = new Date(info.at);
    return { text: `${weekdayName(d, timeZone)} · ${formatTimeInZone(d, timeZone)}`, icon: "clock" };
  }
  if (info.kind === "known-day") {
    const d = new Date(`${info.day}T12:00:00Z`);
    const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" }).format(d).replace(".", "").replace(" de ", " ");
    return { text: `${label} · Horário não definido`, icon: "calendar-clock" };
  }
  if (info.reason === "postponed") return { text: "Nova data a confirmar", icon: "calendar-clock" };
  // Obra que já acabou não tem "próximo episódio": diz isso (e o ano), em vez de "Data não definida".
  if (item.status === "FINISHED") {
    const when = item.endDate ?? item.startDate;
    const year = when ? new Date(when).getUTCFullYear() : null;
    return { text: year ? `Finalizado · ${year}` : "Finalizado", icon: "check" };
  }
  return { text: "Data não definida", icon: "calendar-x" };
}

/** A estrela de acompanhar sobre a capa: círculo escuro com alvo de 44 px. */
const starSx = {
  width: 44,
  height: 44,
  bgcolor: "rgba(8,8,11,0.72)",
  color: "text.primary",
  border: 1,
  borderColor: "divider",
  "&:hover": { bgcolor: "rgba(23,24,32,0.95)" },
} as const;

/** Limita o texto a `lines` linhas (reticências no fim), para os cartões terem sempre a mesma altura. */
export function clampSx(lines: number) {
  return { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } as const;
}

const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;

/** `lang="ja"` para linhas em japonês (kanji/kana), sem marcar as demais. */
export function lineLang(text: string): "ja" | undefined {
  return JAPANESE_TEXT.test(text) ? "ja" : undefined;
}

export type TitleLines = {
  primary: string;
  /** Com "Kanji + furigana": o título com leitura em <ruby> (já sanitizado). */
  primaryHtml: string | null;
  secondary: string[];
  primaryLang?: "ja";
};

/**
 * Linhas de título segundo a preferência de idioma:
 * - Japonês (kanji + kana): original em destaque, depois a leitura em kana e o inglês;
 * - Japonês + furigana: original com a leitura em <ruby>, depois o inglês;
 * - Romaji / Inglês / Português: o título nesse idioma e, abaixo, os demais.
 * A leitura vem do cache do servidor (`/api/readings`), em lote; enquanto não chega, o original aparece sem leitura.
 */
export function useTitleLines(item: TitleSet): TitleLines {
  const { preference } = useTitlePreference();
  const primary = resolveTitleText(preference, item) || "Sem título";
  const japanese = preference.language === "ja" && preference.japaneseScript !== "romaji" && Boolean(item.titleNative);
  const reading = useReading(japanese ? item.titleNative : null);
  const primaryLang = lineLang(primary);

  if (japanese) {
    const latin = [item.titleEnglish, item.titleRomaji].find((t): t is string => Boolean(t) && t !== primary) ?? null;
    if (preference.japaneseScript === "furigana") {
      return { primary, primaryHtml: reading ? sanitizeFuriganaHtml(reading.html) : null, secondary: latin ? [latin] : [], primaryLang };
    }
    const kana = reading && reading.kana !== primary ? reading.kana : null;
    return { primary, primaryHtml: null, secondary: [kana, latin].filter((t): t is string => Boolean(t)), primaryLang };
  }

  const candidates = [item.titleNative, item.titleRomaji, item.titleEnglish].filter((t): t is string => Boolean(t) && t !== primary);
  const seen = new Set<string>();
  const secondary = candidates.filter((t) => (seen.has(t) ? false : (seen.add(t), true))).slice(0, 2);
  return { primary, primaryHtml: null, secondary, primaryLang };
}

/** O título principal: texto simples ou, com furigana disponível, o HTML com <ruby>. */
export function PrimaryTitle({ lines }: { lines: Pick<TitleLines, "primary" | "primaryHtml"> }) {
  if (lines.primaryHtml) return <span suppressHydrationWarning dangerouslySetInnerHTML={{ __html: lines.primaryHtml }} />;
  return <>{lines.primary}</>;
}

/**
 * "Anime Card / Normal" do Figma (`8:1426`): capa 2:3 com raio 12 e selo de
 * novo episódio (só para quem já acompanha), títulos, horário (ou o estado
 * "Data não definida") e "+ Acompanhar". Acompanhar adiciona direto à lista e a pessoa segue na mesma página
 * (para ir escolhendo outras obras); só quem não entrou é levado ao login.
 */
export function ExploreCard({ item }: { item: DiscoverItem }) {
  const titleLines = useTitleLines(item);
  const { secondary, primaryLang } = titleLines;
  const schedule = useScheduleText(item);
  const user = useCurrentUser();
  // Acompanhar daqui adiciona direto à lista, sem sair da página.
  const [followedId, setFollowedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const ownedId = item.inMyList && item.animeId ? item.animeId : followedId;
  const owned = Boolean(ownedId);
  // Quem já acompanha abre o detalhe pessoal; os demais, o detalhe público.
  const detailHref = ownedId ? `/anime/${ownedId}` : workHref(item);
  // Obra sem AniList ID (só do AniDB/Kitsu) também se acompanha, pela chave do catálogo (`anidb-<id>`).
  const catalogWork = item.anilistId === null && CATALOG_ONLY_SLUG.test(item.key) ? item.key : null;
  const followable = item.anilistId !== null || catalogWork !== null;

  async function follow() {
    if (!followable) return;
    setFollowing(true);
    setFollowError(null);
    try {
      const res = await fetch("/api/anime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(catalogWork ? { work: catalogWork } : { anilistId: item.anilistId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFollowError(data.error ?? "Não foi possível acompanhar. Tente novamente.");
        return;
      }
      if (data.anime?.id) setFollowedId(data.anime.id as string);
    } catch {
      setFollowError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setFollowing(false);
    }
  }
  const ScheduleGlyph = schedule.icon === "clock" ? ScheduleIcon : schedule.icon === "check" ? CheckCircleOutlinedIcon : schedule.icon === "calendar-x" ? EventBusyIcon : EventRepeatIcon;
  const info = scheduleOf(item);
  const showNewEpisode = Boolean(item.inMyList && info.kind === "scheduled" && info.episode);

  const cover = (
    <Box sx={{ position: "relative", aspectRatio: "310 / 432", borderRadius: "12px", overflow: "hidden", bgcolor: "#171820" }}>
      {item.coverImage && <CoverImage src={item.coverImage} sizes="(max-width: 900px) 50vw, 310px" />}
      {showNewEpisode && (
        <Box
          sx={{
            position: "absolute",
            top: 16,
            left: 16,
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 0.75,
            borderRadius: "6px",
            bgcolor: "#2c111b",
            color: "primary.main",
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 14 }} />
          <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "inherit", whiteSpace: "nowrap" }}>
            NOVO EPISÓDIO · EP{String(info.kind === "scheduled" ? info.episode : 0).padStart(2, "0")}
          </Typography>
        </Box>
      )}
    </Box>
  );

  // O "acompanhar" é a estrela sobre a capa: vazia = acompanhar; cheia = já acompanha (leva ao detalhe pessoal).
  let star: ReactNode;
  if (owned) {
    star = (
      <IconButton component={NextLink} href={detailHref!} aria-label="Acompanhando" title="Acompanhando" data-testid={`explore-following-${item.key}`} sx={{ ...starSx, color: "primary.main" }}>
        <StarIcon />
      </IconButton>
    );
  } else if (followable && user) {
    star = (
      <IconButton onClick={() => void follow()} disabled={following} aria-label="+ Acompanhar" title="Acompanhar" data-testid={`explore-follow-${item.key}`} sx={starSx}>
        <StarBorderIcon />
      </IconButton>
    );
  } else if (followable && detailHref) {
    star = (
      <IconButton component={NextLink} href={loginHref(detailHref)} aria-label="+ Acompanhar" title="Entrar para acompanhar" sx={starSx}>
        <StarBorderIcon />
      </IconButton>
    );
  } else {
    star = (
      <IconButton disabled aria-label="+ Acompanhar" title="Esta obra ainda não pode ser acompanhada" sx={starSx}>
        <StarBorderIcon />
      </IconButton>
    );
  }

  return (
    <Box data-testid={`explore-card-${item.key}`} sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <Box sx={{ position: "relative" }}>
        {detailHref ? (
          <MuiLink component={NextLink} href={detailHref} aria-hidden tabIndex={-1} underline="none" sx={{ display: "block" }}>
            {cover}
          </MuiLink>
        ) : (
          cover
        )}
        <Box sx={{ position: "absolute", top: 12, right: 12 }}>{star}</Box>
        {followError && (
          <Typography role="alert" sx={{ position: "absolute", left: 8, right: 8, bottom: 8, px: 1, py: 0.5, borderRadius: "6px", bgcolor: "rgba(8,8,11,0.88)", fontSize: 12, color: "primary.main" }}>
            {followError}
          </Typography>
        )}
      </Box>
      {/* Altura fixa para todos os cartões: título em até 2 linhas, um subtítulo e o horário. */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Typography lang={primaryLang} sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5, minHeight: "3em", overflowWrap: "anywhere", ...clampSx(2) }}>
          {detailHref ? (
            <MuiLink component={NextLink} href={detailHref} underline="hover" color="inherit">
              <PrimaryTitle lines={titleLines} />
            </MuiLink>
          ) : (
            <PrimaryTitle lines={titleLines} />
          )}
        </Typography>
        <Typography lang={secondary[0] ? lineLang(secondary[0]) : undefined} sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.5, minHeight: "1.5em", ...clampSx(1) }}>
          {secondary[0] ?? ""}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 24 }}>
        <ScheduleGlyph sx={{ fontSize: 16, flexShrink: 0 }} />
        <Typography suppressHydrationWarning sx={{ fontSize: 14, ...clampSx(1) }}>
          {schedule.text}
        </Typography>
      </Box>
    </Box>
  );
}
