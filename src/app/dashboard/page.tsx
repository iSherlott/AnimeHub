"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { ErrorNotice } from "@/components/StatePanels";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ELEVATED_BUTTON_SX, PrimaryTitle, useTitleLines } from "@/components/ExploreCard";
import { ListRow, NewEpisodeBadge } from "@/components/ListRow";
import { WorkPreviewTrigger } from "@/components/WorkPreview";
import { SectionHeader } from "@/components/ExploreParts";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { CalendarItem } from "@/lib/calendarItem";
import type { MyListEntry } from "@/lib/myList";
import { dayKeyInZone, formatTimeInZone, startOfWeekMondayInZone, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";
import { resolveTitleTextLenient, useTitlePreference } from "@/lib/titlePreference";
import { loginHref } from "@/lib/safeRedirect";

/**
 * "Seu dia, em anime." (Figma `8:2442`, D-05): o que lança hoje da SUA lista
 * e qual é o próximo horário. Acesso pelo logo. Contadores nunca viram "0"
 * enquanto carregam nem quando a busca falha (`8:5323`, `8:5448`), e
 * "Minha lista" conta vínculos — não consumo.
 */
type AlertItem = {
  id: string;
  anilistId: number;
  episode: number;
  airingAt: string;
  previousAiringAt: string | null;
  kind?: "EPISODE" | "RETURN";
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  titlePortuguese: string | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: CalendarItem[]; entries: MyListEntry[]; alerts: AlertItem[] };

const pad = (n: number) => String(n).padStart(2, "0");

export default function DashboardPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const { preference } = useTitlePreference();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (user === null) router.replace(loginHref("/dashboard"));
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const now = new Date();
    const weekStart = (offset: number) => Math.floor(startOfWeekMondayInZone(now, offset, timeZone).getTime() / 1000);
    // Semana atual + próxima: "Depois de hoje" pode cruzar o domingo.
    Promise.all([
      fetch(`/api/calendar?weekOffset=0&weekStart=${weekStart(0)}`),
      fetch(`/api/calendar?weekOffset=1&weekStart=${weekStart(1)}`),
      fetch("/api/my-list"),
      // Alertas são complemento: se falharem, o resto do painel continua valendo.
      fetch("/api/notifications").catch(() => null),
    ])
      .then(async ([w0, w1, list, notifications]) => {
        if (!w0.ok || !w1.ok || !list.ok) throw new Error("falha");
        const [a, b, l] = await Promise.all([w0.json(), w1.json(), list.json()]);
        const alerts: AlertItem[] = notifications && notifications.ok ? ((await notifications.json()).alerts ?? []) : [];
        if (cancelled) return;
        const items: CalendarItem[] = [...(a.results ?? []), ...(b.results ?? [])];
        setState({ kind: "ready", items, entries: l.entries ?? [], alerts });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [user, reloadKey, timeZone]);

  const view = useMemo(() => {
    if (state.kind !== "ready") return null;
    const now = new Date();
    const mine = state.items
      .filter((i) => i.inMyList)
      .sort((x, y) => Date.parse(x.airingAt) - Date.parse(y.airingAt));
    const todayKey = dayKeyInZone(now, timeZone);
    const isToday = (i: CalendarItem) => dayKeyInZone(new Date(i.airingAt), timeZone) === todayKey;
    const today = mine.filter(isToday);
    const later = mine.filter((i) => new Date(i.airingAt) > now && !isToday(i)).slice(0, 2);
    const available = today.filter((i) => new Date(i.airingAt) <= now);
    const undated = state.entries.filter((e) => e.state.kind === "undated").length;
    return { today, later, available, undated, now };
  }, [state, timeZone]);

  const retry = () => {
    setState({ kind: "loading" });
    setReloadKey((k) => k + 1);
  };

  const now = new Date();
  const kicker = `今日 / ${weekdayName(now, timeZone).toUpperCase()}, ${new Intl.DateTimeFormat("pt-BR", { timeZone, day: "numeric", month: "long", year: "numeric" })
    .format(now)
    .replace(/ de /g, " ")
    .toUpperCase()}`;
  const todayChip = `${new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(now).replace(".", "").toUpperCase()} ${new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" }).format(now)} · HORÁRIO LOCAL`;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <PageIntro
          kicker={kicker}
          title="Seu dia, em anime."
          subtitle="Os lançamentos da sua lista. Sem perder de vista o próximo horário."
          action={
            <Button component={NextLink} href="/calendar" startIcon={<CalendarMonthIcon />} sx={ELEVATED_BUTTON_SX}>
              Abrir calendário
            </Button>
          }
        />

        {state.kind === "error" && (
          <ErrorNotice title="Não foi possível carregar os lançamentos." onRetry={retry}>
            Sua lista está segura. Tente novamente para consultar os horários de hoje.
          </ErrorNotice>
        )}

        {(state.kind === "loading" || user === undefined) && (
          <Box aria-busy="true" role="status" aria-label="Carregando" data-testid="dashboard-loading" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 3 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" animation="wave" height={176} sx={{ borderRadius: "16px", bgcolor: "#171820" }} />
              ))}
            </Box>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" animation="wave" height={120} sx={{ borderRadius: "12px", bgcolor: "#171820" }} />
            ))}
          </Box>
        )}

        {state.kind === "ready" && view && (
          <>
            <Box data-testid="dashboard-counters" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 3 }}>
              <Counter
                label="Hoje"
                value={view.today.length}
                hint={`${view.today.length === 1 ? "lançamento" : "lançamentos"} · ${weekdayName(now, timeZone).toLowerCase()} ${new Intl.DateTimeFormat("pt-BR", { timeZone, day: "numeric" }).format(now)}`}
                id="today"
              />
              <Counter
                label="Novos episódios"
                value={view.available.length}
                hint={
                  view.available.length === 0
                    ? "nenhum disponível ainda hoje"
                    : `${joinEpisodes(view.available.map((i) => i.episode))} ${view.available.length === 1 ? "disponível" : "disponíveis"}`
                }
                id="available"
              />
              <Counter label="Minha lista" value={state.entries.length} hint="animes acompanhando" id="following" />
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 396px" }, gap: 4, alignItems: "start" }}>
              <Box component="section" aria-labelledby="hoje-heading" sx={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                  <Typography id="hoje-heading" component="h2" sx={{ fontSize: 24, lineHeight: 1.5, textTransform: "uppercase" }}>
                    Hoje
                  </Typography>
                  <Box sx={{ px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#2c111b" }}>
                    <Typography component="span" suppressHydrationWarning sx={{ fontSize: 11, fontWeight: 700, color: "primary.main", whiteSpace: "nowrap" }}>
                      {todayChip}
                    </Typography>
                  </Box>
                </Box>
                {view.today.length === 0 ? (
                  <Typography sx={{ color: "text.secondary" }} data-testid="today-empty">
                    Nenhum lançamento da sua lista hoje.
                  </Typography>
                ) : (
                  <>
                    <Box component="ul" data-testid="today-list" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 0, m: 0 }}>
                      {view.today.map((item) => {
                        const aired = new Date(item.airingAt) <= view.now;
                        return (
                          <ListRow
                            key={item.key}
                            linkWhole
                            href={item.animeId ? `/anime/${item.animeId}` : `/anime/${item.anilistId}`}
                            time={formatTimeInZone(new Date(item.airingAt), timeZone)}
                            episodeLabel={`Episódio ${pad(item.episode)}`}
                            cover={item.coverImage}
                            titles={item}
                            preview={{ description: item.description, anilistId: item.anilistId, genres: item.genres }}
                            highlighted={aired}
                            badge={aired ? <NewEpisodeBadge>NOVO EPISÓDIO EP{pad(item.episode)}</NewEpisodeBadge> : undefined}
                          />
                        );
                      })}
                    </Box>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      {view.available.length === 0
                        ? "Nenhum episódio disponível ainda; "
                        : `${view.available.length} ${view.available.length === 1 ? "novo episódio destacado" : "novos episódios destacados"}; `}
                      {view.today.length === 1 ? "o evento pertence" : `os ${view.today.length} eventos pertencem`} a hoje.
                    </Typography>
                  </>
                )}
              </Box>

              <Box
                component="aside"
                aria-labelledby="depois-heading"
                sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: 3, borderRadius: "16px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}
              >
                <Typography id="depois-heading" component="h2" sx={{ fontSize: 20, lineHeight: 1.5 }}>
                  Depois de hoje
                </Typography>
                {view.later.length === 0 ? (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum outro lançamento da sua lista nos próximos dias.</Typography>
                ) : (
                  <Box component="ul" data-testid="later-list" sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: 0, m: 0, listStyle: "none" }}>
                    {view.later.map((item) => (
                      <LaterItem key={item.key} item={item} now={view.now} href={item.animeId ? `/anime/${item.animeId}` : `/anime/${item.anilistId}`} />
                    ))}
                  </Box>
                )}
                {view.undated > 0 && (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                    Sem data definida: {view.undated} {view.undated === 1 ? "anime" : "animes"}. {view.undated === 1 ? "Ele permanece" : "Eles permanecem"} fora da agenda.
                  </Typography>
                )}
                <Box>
                  <Button component={NextLink} href="/minha-lista" startIcon={<ArrowOutwardIcon />} sx={ELEVATED_BUTTON_SX}>
                    Ver Minha Lista
                  </Button>
                </Box>
              </Box>
            </Box>

            <UpdatesSection alerts={state.alerts} titleOf={(a) => resolveTitleTextLenient(preference, a, "Anime")} timeZone={timeZone} />
          </>
        )}
      </PageContainer>
    </Box>
  );
}

function joinEpisodes(episodes: number[]): string {
  const labels = episodes.map((e) => `EP${pad(e)}`);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

function Counter({ label, value, hint, id }: { label: string; value: number; hint: string; id: string }) {
  return (
    <Box
      data-testid={`counter-${id}`}
      sx={{ display: "flex", flexDirection: "column", gap: 2.5, p: 3, borderRadius: "16px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}
    >
      <Typography component="p" sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography component="p" sx={{ fontSize: 40, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography suppressHydrationWarning component="p" sx={{ fontSize: 14, color: "text.secondary" }}>
        {hint}
      </Typography>
    </Box>
  );
}

function LaterItem({ item, now, href }: { item: CalendarItem; now: Date; href: string }) {
  const timeZone = useTimeZone();
  const titleLines = useTitleLines(item);
  const { secondary, primaryLang } = titleLines;
  const date = new Date(item.airingAt);
  const tomorrow = new Date(now.getTime() + 86400_000);
  const isTomorrow = dayKeyInZone(date, timeZone) === dayKeyInZone(tomorrow, timeZone);
  const dayNumber = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" }).format(date);
  const kicker = isTomorrow
    ? `AMANHÃ / ${new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(date).replace(".", "").toUpperCase()} ${dayNumber}`
    : `${weekdayName(date, timeZone).toUpperCase()} / ${dayNumber} ${new Intl.DateTimeFormat("pt-BR", { timeZone, month: "short" }).format(date).replace(".", "").toUpperCase()}`;
  return (
    <li>
      <WorkPreviewTrigger
        label={titleLines.primary}
        info={{ titles: item, coverImage: item.coverImage, href, description: item.description, anilistId: item.anilistId, genres: item.genres, meta: [`${formatTimeInZone(date, timeZone)} · EP${pad(item.episode)}`] }}
        sx={{ display: "flex", flexDirection: "column", gap: 1, color: "text.primary", "&:hover .later-title": { textDecoration: "underline" } }}
      >
        <Typography suppressHydrationWarning component="p" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
          {kicker}
        </Typography>
        <Typography suppressHydrationWarning component="p" sx={{ fontSize: 32, lineHeight: 1.3 }}>
          {formatTimeInZone(date, timeZone)} · EP{pad(item.episode)}
        </Typography>
        <Typography className="later-title" lang={primaryLang} sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
          <PrimaryTitle lines={titleLines} />
        </Typography>
        {secondary[0] && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{secondary[secondary.length - 1]}</Typography>}
      </WorkPreviewTrigger>
    </li>
  );
}

/** "Atualizações da sua lista" (Figma `8:2442`): o alerta de novo episódio e o de data alterada mais recentes. */
function UpdatesSection({
  alerts,
  titleOf,
  timeZone,
}: {
  alerts: AlertItem[];
  titleOf: (a: AlertItem) => string;
  timeZone: string;
}) {
  const newEpisode = alerts.find((a) => !a.previousAiringAt && a.kind !== "RETURN");
  const changed = alerts.find((a) => a.previousAiringAt);
  const returned = alerts.find((a) => a.kind === "RETURN");
  if (!newEpisode && !changed && !returned) return null;
  const slot = (iso: string) => `${weekdayName(new Date(iso), timeZone).toLowerCase()}, ${formatTimeInZone(new Date(iso), timeZone)}`;
  const dm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit" }).format(new Date(iso));
  return (
    <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <SectionHeader title="Atualizações da sua lista" />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        {newEpisode && (
          <Box sx={{ display: "flex", gap: 2, p: 2.5, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
            <InfoOutlinedIcon sx={{ fontSize: 20, color: "text.secondary", mt: 0.25 }} />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Typography component="h3" sx={{ fontSize: 16 }}>
                NOVO EPISÓDIO · EP{pad(newEpisode.episode)} disponível
              </Typography>
              <Typography suppressHydrationWarning sx={{ fontSize: 14, color: "text.secondary" }}>
                {titleOf(newEpisode)} · {slot(newEpisode.airingAt)}. Abra o detalhe para consultar a previsão.
              </Typography>
            </Box>
          </Box>
        )}
        {returned && (
          <Box data-testid="dashboard-returned" sx={{ display: "flex", gap: 2, p: 2.5, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
            <InfoOutlinedIcon sx={{ fontSize: 20, color: "primary.main", mt: 0.25 }} />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Typography component="h3" sx={{ fontSize: 16 }}>
                VOLTOU A SAIR EPISÓDIOS
              </Typography>
              <Typography suppressHydrationWarning sx={{ fontSize: 14, color: "text.secondary" }}>
                {titleOf(returned)} · próximo episódio {slot(returned.airingAt)}. Voltou à sua lista e ao calendário.
              </Typography>
            </Box>
          </Box>
        )}
        {changed && changed.previousAiringAt && (
          <Box sx={{ display: "flex", gap: 2, p: 2.5, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
            <InfoOutlinedIcon sx={{ fontSize: 20, color: "warning.main", mt: 0.25 }} />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Typography suppressHydrationWarning component="h3" sx={{ fontSize: 16 }}>
                DATA ALTERADA · {slot(changed.airingAt)}
              </Typography>
              <Typography suppressHydrationWarning sx={{ fontSize: 14, color: "text.secondary" }}>
                {titleOf(changed)} · a previsão mudou de {dm(changed.previousAiringAt)} para {dm(changed.airingAt)}. Horário local atualizado.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
