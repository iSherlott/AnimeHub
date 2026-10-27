"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import Image from "next/image";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import { Box, Link as MuiLink, Typography } from "@mui/material";
import { SectionTitle } from "@/components/PageShell";
import { HashtagRow } from "@/components/HashtagRow";
import { UserAvatar } from "@/components/UserAvatar";
import { FriendButton } from "@/components/profile/ProfileActions";
import type { RecommendationItem } from "@/lib/animeRecommendations";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { currentSeasonTag } from "@/lib/season";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";
import { formatTimeInZone, timeZoneLabel } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";
import type { CalendarItem } from "@/lib/calendarItem";

type Tag = { key: string; display: string };
type Person = { id: string; displayName: string; handle: string | null; avatarUrl: string | null; detail: string | null };
type ActiveTopic = { id: string; title: string; replyCount: number; lastActivityAt: string; communityKey: string; community: string };
type Birthday = { id: string; displayName: string; avatarUrl: string | null; birthDay: number; birthMonth: number; inDays: number };
const KIND_LABEL: Record<string, string> = { WORK: "Obra", SEASON: "Temporada", GENRE: "Gênero", TOPIC: "Tópico" };
const GROUPS: Array<{ kind: string; label: string }> = [
  { kind: "WORK", label: "OBRA" },
  { kind: "GENRE", label: "GÊNERO" },
  { kind: "TOPIC", label: "TÓPICO" },
];

/**
 * Lateral do Feed (Figma `13:41368`): "Em alta agora" (hashtags dos últimos 7 dias), "Conversas da temporada" com a
 * hashtag da temporada e as populares por tipo, "Também na sua agenda"
 * (próximo episódio da Minha Lista, só para quem tem conta) e "Pessoas que você
 * talvez conheça" (comunidades e animes em comum). Nada aqui publica a Minha
 * Lista de ninguém.
 */
export function CommunitySidebar() {
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const { preference } = useTitlePreference();
  const season = useMemo(() => currentSeasonTag(new Date(), timeZone), [timeZone]);
  const [groups, setGroups] = useState<Record<string, Tag[]>>({});
  const [trending, setTrending] = useState<Array<Tag & { postCount: number; kind: string }> | null>(null);
  const [next, setNext] = useState<CalendarItem | null>(null);
  const [recommended, setRecommended] = useState<RecommendationItem[] | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [birthdays, setBirthdays] = useState<Birthday[] | null>(null);
  const [topics, setTopics] = useState<ActiveTopic[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hashtags")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setGroups(data.groups ?? {});
      })
      .catch(() => undefined);
    fetch("/api/hashtags?trending=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setTrending(data?.trending ?? []);
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

  // "Nas suas comunidades": os tópicos mais ativos das comunidades em que a pessoa participa.
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetch("/api/communities/active-topics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setTopics(data?.topics ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // Aniversários dos amigos (hoje e nos próximos dias).
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetch("/api/friends/birthdays")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setBirthdays(data?.birthdays ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // "Pessoas que você talvez conheça": as mesmas sugestões da página Amigos (três aqui).
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetch("/api/friends/suggestions?take=3")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setPeople(data?.people ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // "Animes recomendados": só obras já carregadas (temporada atual + as que o admin carregou), ver animeRecommendations.ts.
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetch("/api/feed/recommendations")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setRecommended(data?.animes ?? []);
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
      {/* "Em alta agora" (como no Twitter): as hashtags com mais publicações nos últimos 7 dias, em ordem. */}
      {trending && trending.length > 0 && (
        <Box component="section" aria-labelledby="em-alta-heading" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="trending-hashtags">
          <SectionTitle>
            <span id="em-alta-heading">Em alta agora</span>
          </SectionTitle>
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
            {trending.map((t, i) => (
              <Box component="li" key={t.key} sx={{ borderTop: i ? 1 : 0, borderColor: "divider" }}>
                <MuiLink component={NextLink} href={`/hashtag/${encodeURIComponent(t.key)}`} underline="none" data-testid={`trending-${t.key}`} sx={{ display: "flex", flexDirection: "column", py: 1, color: "text.primary", "&:hover .tag": { textDecoration: "underline" } }}>
                  <Typography component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                    {i + 1} · {KIND_LABEL[t.kind] ?? "Tópico"} · em alta
                  </Typography>
                  <Typography component="span" className="tag" sx={{ fontSize: 15, fontWeight: 700 }}>
                    #{t.display}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                    {t.postCount} {t.postCount === 1 ? "publicação" : "publicações"} nos últimos 7 dias
                  </Typography>
                </MuiLink>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SectionTitle>Conversas da temporada</SectionTitle>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {season.labelPt} {season.year}
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
                Hoje · {timeZoneLabel(timeZone)}
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

      {loggedIn && topics && topics.length > 0 && (
        <Box component="section" aria-labelledby="comunidades-heading" data-testid="sidebar-community-topics" sx={{ borderTop: 1, borderColor: "divider", pt: 3, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <SectionTitle>
            <span id="comunidades-heading">Nas suas comunidades</span>
          </SectionTitle>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
            {topics.map((t, i) => (
              <Box component="li" key={t.id} sx={{ borderTop: i ? 1 : 0, borderColor: "divider" }} data-testid={`sidebar-topic-${t.id}`}>
                <MuiLink component={NextLink} href={`/comunidades/${t.communityKey}/topicos/${t.id}?pagina=ultima`} underline="none" sx={{ display: "flex", flexDirection: "column", py: 1, color: "text.primary", "&:hover .topic-title": { textDecoration: "underline" } }}>
                  <Typography component="span" sx={{ fontSize: 12, color: "text.secondary", overflowWrap: "anywhere" }}>
                    {t.community}
                  </Typography>
                  <Typography component="span" className="topic-title" sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
                    {t.title}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                    {t.replyCount} {t.replyCount === 1 ? "resposta" : "respostas"}
                  </Typography>
                </MuiLink>
              </Box>
            ))}
          </Box>
          <MuiLink component={NextLink} href="/comunidades" underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            Minhas comunidades
          </MuiLink>
        </Box>
      )}

      {loggedIn && birthdays && birthdays.length > 0 && (
        <Box component="section" aria-labelledby="aniversarios-heading" data-testid="sidebar-birthdays" sx={{ borderTop: 1, borderColor: "divider", pt: 3, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <SectionTitle>
            <span id="aniversarios-heading">Aniversários</span>
          </SectionTitle>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1.5 }}>
            {birthdays.slice(0, 5).map((b) => (
              <Box component="li" key={b.id} data-testid={`sidebar-birthday-${b.id}`}>
                <Box component={NextLink} href={b.inDays === 0 ? `/users/${b.id}#recados` : `/users/${b.id}`} sx={{ display: "flex", gap: 1.5, alignItems: "center", color: "text.primary", textDecoration: "none", "&:hover .person-name": { textDecoration: "underline" } }}>
                  <UserAvatar id={b.id} displayName={b.displayName} avatarUrl={b.avatarUrl} size={36} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography className="person-name" sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
                      {b.displayName}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: b.inDays === 0 ? "primary.main" : "text.secondary" }}>
                      {b.inDays === 0 ? "🎂 Hoje · deixe um recado" : b.inDays === 1 ? "Amanhã" : `Em ${b.inDays} dias`}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {loggedIn && people && people.length > 0 && (
        <Box component="section" aria-labelledby="pessoas-heading" data-testid="sidebar-people" sx={{ borderTop: 1, borderColor: "divider", pt: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <SectionTitle>
            <span id="pessoas-heading">Pessoas que você talvez conheça</span>
          </SectionTitle>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
            {people.map((p) => (
              <Box component="li" key={p.id} data-testid={`sidebar-person-${p.id}`} sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Box component={NextLink} href={`/users/${p.id}`} sx={{ display: "flex", gap: 1.5, alignItems: "center", color: "text.primary", textDecoration: "none", "&:hover .person-name": { textDecoration: "underline" } }}>
                  <UserAvatar id={p.id} displayName={p.displayName} avatarUrl={p.avatarUrl} size={40} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography className="person-name" sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
                      {p.displayName}
                    </Typography>
                    {p.detail && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{p.detail}</Typography>}
                  </Box>
                </Box>
                <Box sx={{ alignSelf: "flex-start" }}>
                  <FriendButton userId={p.id} initial="none" compact />
                </Box>
              </Box>
            ))}
          </Box>
          <MuiLink component={NextLink} href="/amigos#sugestoes" underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            Ver mais sugestões
          </MuiLink>
        </Box>
      )}

      {loggedIn && recommended !== null && (
        <Box component="section" aria-label="Animes recomendados" data-testid="sidebar-recommendations" sx={{ borderTop: 1, borderColor: "divider", pt: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          <SectionTitle>Animes recomendados</SectionTitle>
          {recommended.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              Acompanhe mais animes da temporada para ver recomendações aqui.
            </Typography>
          ) : (
            <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 0, m: 0, listStyle: "none" }}>
              {recommended.map((rec) => (
                <SidebarRecommendation key={rec.anilistId} rec={rec} />
              ))}
            </Box>
          )}
        </Box>
      )}

      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Seus interesses não são publicados. Acompanhar uma obra não cria uma publicação.
      </Typography>
    </>
  );
}

function SidebarRecommendation({ rec }: { rec: RecommendationItem }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleTextLenient(preference, { titleRomaji: rec.titleRomaji, titleEnglish: rec.titleEnglish, titleNative: null, titlePortuguese: null }, "Anime");
  const reason = rec.becauseTitle ? `Porque você acompanha ${rec.becauseTitle}` : rec.sharedGenres.length > 0 ? `Gêneros em comum: ${rec.sharedGenres.slice(0, 3).join(", ")}` : null;
  return (
    <Box component="li" data-testid={`sidebar-recommendation-${rec.anilistId}`}>
      <Box component={NextLink} href={rec.href} sx={{ display: "flex", gap: 2, alignItems: "center", color: "text.primary", textDecoration: "none", "&:hover .rec-title": { textDecoration: "underline" } }}>
        <Box sx={{ position: "relative", width: 48, height: 68, borderRadius: "8px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>
          {rec.coverImage && <Image src={rec.coverImage} alt="" fill sizes="48px" style={{ objectFit: "cover" }} />}
        </Box>
        <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Typography className="rec-title" sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, overflowWrap: "anywhere" }}>
            {title}
          </Typography>
          {reason && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{reason}</Typography>}
        </Box>
      </Box>
    </Box>
  );
}
