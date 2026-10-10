"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import Image from "next/image";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import { Box, Link as MuiLink, Typography } from "@mui/material";
import { SectionTitle } from "@/components/PageShell";
import { HashtagRow } from "@/components/HashtagRow";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { currentSeasonTag } from "@/lib/season";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";
import { formatTimeInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";
import type { CalendarItem } from "@/lib/calendarItem";

type Tag = { key: string; display: string };
const GROUPS: Array<{ kind: string; label: string }> = [
  { kind: "WORK", label: "OBRA" },
  { kind: "GENRE", label: "GÊNERO" },
  { kind: "TOPIC", label: "TÓPICO" },
];

/**
 * Lateral da Comunidade (Figma `13:41368`): "Conversas da temporada" com a
 * hashtag da temporada e as populares por tipo, e "Também na sua agenda"
 * (próximo episódio da Minha Lista, só para quem tem conta). Nada aqui
 * publica a Minha Lista de ninguém.
 */
export function CommunitySidebar() {
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const { preference } = useTitlePreference();
  const season = useMemo(() => currentSeasonTag(new Date(), timeZone), [timeZone]);
  const [groups, setGroups] = useState<Record<string, Tag[]>>({});
  const [next, setNext] = useState<CalendarItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hashtags")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setGroups(data.groups ?? {});
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const loggedIn = Boolean(user);
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetch("/api/calendar?weekOffset=0")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const now = Date.now();
        const mine = ((data.results ?? []) as CalendarItem[])
          .filter((i) => i.inMyList && new Date(i.airingAt).getTime() >= now)
          .sort((a, b) => a.airingAt.localeCompare(b.airingAt));
        setNext(mine[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  const airing = next ? new Date(next.airingAt) : null;
  const nextTitle = next
    ? resolveTitleTextLenient(
        preference,
        { titleRomaji: next.titleRomaji, titleEnglish: next.titleEnglish, titleNative: next.titleNative, titlePortuguese: next.titlePortuguese },
        "Anime"
      )
    : "";

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SectionTitle>Conversas da temporada</SectionTitle>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {season.label} · {season.labelPt} {season.year}
        </Typography>
        <HashtagRow tags={[{ key: season.key, display: season.tag }]} />
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Um ponto de encontro para primeiras impressões, sem precisar conhecer todo mundo.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {GROUPS.map(({ kind, label }) =>
          groups[kind]?.length ? (
            <Box key={kind} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>{label}</Typography>
              <HashtagRow tags={groups[kind]} />
            </Box>
          ) : null
        )}
      </Box>

      {loggedIn && (
        <Box sx={{ borderTop: 1, borderColor: "divider", pt: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <SectionTitle>Também na sua agenda</SectionTitle>
          {next && airing ? (
            <>
              <Box
                sx={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 1, bgcolor: "#171820", px: 1, py: 0.75, borderRadius: "6px", color: "text.secondary" }}
              >
                <CalendarMonthOutlinedIcon sx={{ fontSize: 14 }} />
                <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
                  {new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(airing).replace(".", "").replace(/^./, (c) => c.toUpperCase())} ·{" "}
                  {formatTimeInZone(airing, timeZone)} · EP{String(next.episode).padStart(2, "0")}
                </Typography>
              </Box>
              <Box
                sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: "12px", px: 3, py: 2.5, display: "flex", gap: 3, alignItems: "center" }}
              >
                <Box sx={{ position: "relative", width: 56, height: 80, borderRadius: "12px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>
                  {next.coverImage && <Image src={next.coverImage} alt="" fill sizes="56px" style={{ objectFit: "cover" }} />}
                </Box>
                <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography lang={next.titleNative ? "ja" : undefined} sx={{ fontSize: 12 }}>
                    {nextTitle}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    {[next.titleEnglish, next.titleRomaji].filter((t, i, a) => t && t !== nextTitle && a.indexOf(t) === i)[0] ?? ""}
                  </Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Hoje · programação em {timeZone}
              </Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              Nenhum episódio da sua lista nos próximos dias.
            </Typography>
          )}
          <MuiLink component={NextLink} href="/calendar" underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            Consultar calendário ↗
          </MuiLink>
        </Box>
      )}

      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Seus interesses não são publicados. Acompanhar uma obra não cria uma publicação.
      </Typography>
    </>
  );
}
