"use client";

import { useState } from "react";
import NextLink from "next/link";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { Box, Button, Link as MuiLink, Typography } from "@mui/material";
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

export const ELEVATED_BUTTON_SX = {
  bgcolor: "#171820",
  color: "text.primary",
  border: 1,
  borderColor: "divider",
  "&:hover": { bgcolor: "#1d1e28" },
} as const;

/** "Sábado · 13:00" / "11 out · Horário não definido" / "Data não definida" — nunca inventa horário. */
export function useScheduleText(item: DiscoverItem): { text: string; icon: "clock" | "calendar-x" | "calendar-clock" } {
  const timeZone = useTimeZone();
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
  return info.reason === "postponed"
    ? { text: "Nova data a confirmar", icon: "calendar-clock" }
    : { text: "Data não definida", icon: "calendar-x" };
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
  const detailHref = ownedId ? `/anime/${ownedId}` : item.anilistId !== null ? `/anime/${item.anilistId}` : null;

  async function follow() {
    if (item.anilistId === null) return;
    setFollowing(true);
    setFollowError(null);
    try {
      const res = await fetch("/api/anime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anilistId: item.anilistId }) });
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
  const ScheduleGlyph = schedule.icon === "clock" ? ScheduleIcon : schedule.icon === "calendar-x" ? EventBusyIcon : EventRepeatIcon;
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

  return (
    <Box data-testid={`explore-card-${item.key}`} sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      {detailHref ? (
        <MuiLink component={NextLink} href={detailHref} aria-hidden tabIndex={-1} underline="none" sx={{ display: "block" }}>
          {cover}
        </MuiLink>
      ) : (
        cover
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Typography lang={primaryLang} sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {detailHref ? (
            <MuiLink component={NextLink} href={detailHref} underline="hover" color="inherit">
              <PrimaryTitle lines={titleLines} />
            </MuiLink>
          ) : (
            <PrimaryTitle lines={titleLines} />
          )}
        </Typography>
        {secondary.map((line, i) => (
          <Typography key={line} lang={lineLang(line)} sx={{ fontSize: i === 0 ? 12 : 13, color: "text.secondary", lineHeight: 1.5 }}>
            {line}
          </Typography>
        ))}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <ScheduleGlyph sx={{ fontSize: 16 }} />
        <Typography suppressHydrationWarning sx={{ fontSize: 14 }}>
          {schedule.text}
        </Typography>
      </Box>
      <Box>
        {owned ? (
          <Button component={NextLink} href={detailHref!} startIcon={<CheckIcon />} sx={ELEVATED_BUTTON_SX}>
            Acompanhando
          </Button>
        ) : detailHref && user ? (
          <Button onClick={() => void follow()} disabled={following} sx={ELEVATED_BUTTON_SX} data-testid={`explore-follow-${item.key}`}>
            {following ? "Adicionando…" : "+ Acompanhar"}
          </Button>
        ) : detailHref ? (
          <Button component={NextLink} href={loginHref(detailHref)} sx={ELEVATED_BUTTON_SX}>
            + Acompanhar
          </Button>
        ) : (
          <Button disabled sx={ELEVATED_BUTTON_SX} title="Esta obra ainda não tem página pública">
            + Acompanhar
          </Button>
        )}
        {followError && (
          <Typography role="alert" sx={{ fontSize: 12, color: "primary.main", mt: 0.5 }}>
            {followError}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
