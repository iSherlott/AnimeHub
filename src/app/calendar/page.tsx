"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import EventNoteIcon from "@mui/icons-material/EventNote";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Box, Button, Link as MuiLink, Typography } from "@mui/material";
import { ErrorNotice } from "@/components/StatePanels";
import NextLink from "next/link";
import { Header } from "@/components/Header";
import { CalendarDayColumn } from "@/components/CalendarDayColumn";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { mergeConsecutiveEpisodes, type CalendarItem } from "@/lib/calendarItem";
import type { OffGridItem } from "@/lib/calendarOffGrid";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { loginHref } from "@/lib/safeRedirect";
import { buildWeekDaysInZone, dayKeyInZone, formatTimeInZone, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

const MAX_WEEK_OFFSET = 8;

/** Botão do Figma: "elevated" com borda (ou acento quando selecionado). */
const buttonSx = (selected = false) =>
  selected
    ? { bgcolor: "primary.main", color: "primary.contrastText", border: 1, borderColor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }
    : { bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } };

function OffGridTitle({ item }: { item: OffGridItem }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, { ...item, titlePortuguese: null }) || "Sem título";
  return (
    <MuiLink
      component={NextLink}
      href={`/obra/${item.anilistId}`}
      underline="hover"
      color="inherit"
      lang={item.titleNative && title === item.titleNative ? "ja" : undefined}
      sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}
    >
      {title}
    </MuiLink>
  );
}

function StateChip({ tone = "neutral", icon, children }: { tone?: "neutral" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        alignSelf: "flex-start",
        px: 1,
        py: 0.75,
        borderRadius: "6px",
        bgcolor: "#171820",
        color: tone === "warning" ? "warning.main" : "text.secondary",
        "& svg": { fontSize: 14 },
      }}
    >
      {icon}
      <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "inherit" }}>
        {children}
      </Typography>
    </Box>
  );
}

const panelSx = { display: "flex", flexDirection: "column", gap: 2, p: 3, borderRadius: "16px", bgcolor: "background.paper", border: 1, borderColor: "divider", minWidth: 0 } as const;

/**
 * Calendário (Figma `8:2106`): agenda semanal em COLUNAS por dia (segunda →
 * domingo), cada lançamento numa lista em ordem de horário. O que não tem
 * horário confiável nunca ganha posição na grade: "Previsão atrasada" e os
 * painéis "Sem horário definido" / "Data não definida". A grade ocupa a
 * largura toda da tela e escala com o monitor (ultrawide incluso): todas as
 * medidas internas são em `em` e a base cresce de 14 px (1440 px) até 22 px.
 */
export default function CalendarPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const { preference } = useTitlePreference();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [offGrid, setOffGrid] = useState<OffGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAll, setShowAllRaw] = useState(false);
  const userTouchedToggle = useRef(false);

  function setShowAll(value: boolean) {
    userTouchedToggle.current = true;
    setShowAllRaw(value);
  }

  useEffect(() => {
    // Sem login não existe "minha lista" pra mostrar — evita a tela ficar
    // sempre vazia por padrão pra quem não está logado. Se a pessoa já mexeu
    // no filtro manualmente, não sobrescreve a escolha dela. A receita de
    // ajustar isso durante a renderização via ref não se aplica aqui — o lint
    // react-hooks/refs deste projeto proíbe acessar ref.current fora de
    // efeito/handler.
    if (userTouchedToggle.current) return;
    if (user === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAllRaw(true);
    }
  }, [user]);

  // "Acompanhar" no preview adiciona direto à lista: o item passa a contar como da lista sem recarregar.
  function markFollowed(anilistId: number, animeId: string) {
    setItems((current) => current.map((i) => (i.anilistId === anilistId ? { ...i, inMyList: true, animeId } : i)));
  }

  // "Adiar" no preview: o selo "Adiado · EPnn" aparece (ou some) em todos os itens da obra sem recarregar.
  function markPending(anilistId: number, fromEpisode: number | null) {
    setItems((current) => current.map((i) => (i.anilistId === anilistId ? { ...i, pendingFrom: fromEpisode } : i)));
  }

  const weekDays = useMemo(() => buildWeekDaysInZone(weekOffset, timeZone), [weekOffset, timeZone]);
  const todayKey = useMemo(() => dayKeyInZone(new Date(), timeZone), [timeZone]);

  useEffect(() => {
    let cancelled = false;
    // Mostra "carregando" de novo assim que a semana muda, antes mesmo da
    // busca terminar (forma canônica de buscar dados num efeito, ver docs do
    // React); sem uma lib de fetch não há como sinalizar isso sem setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    // O início da semana (segunda 00:00 no fuso escolhido) vai como timestamp
    // absoluto — o servidor não recalcula "hoje" com o próprio relógio, porque
    // server e navegador podem discordar sobre qual semana é a atual.
    const weekStart = Math.floor(weekDays[0].getTime() / 1000);
    fetch(`/api/calendar?weekOffset=${weekOffset}&weekStart=${weekStart}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Falha ao carregar o calendário");
          return;
        }
        setItems(data.results ?? []);
        setOffGrid(data.offGrid ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Falha ao carregar o calendário");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekOffset, weekDays, reloadKey]);

  // "05–11 out 2026" (ou "28 set – 04 out 2026" quando a semana vira o mês).
  const weekRangeLabel = useMemo(() => {
    const part = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone, ...opts }).format(d).replace(".", "");
    const start = weekDays[0];
    const end = weekDays[6];
    const sameMonth = part(start, { month: "short" }) === part(end, { month: "short" });
    const year = part(end, { year: "numeric" });
    return sameMonth
      ? `${part(start, { day: "2-digit" })}–${part(end, { day: "2-digit" })} ${part(end, { month: "short" })} ${year}`
      : `${part(start, { day: "2-digit", month: "short" })} – ${part(end, { day: "2-digit", month: "short" })} ${year}`;
  }, [weekDays, timeZone]);

  const visibleItems = useMemo(() => (showAll ? items : items.filter((i) => i.inMyList)), [items, showAll]);

  const itemsByDay = useMemo(() => {
    return weekDays.map((day) => {
      const dayKey = dayKeyInZone(day, timeZone);
      return mergeConsecutiveEpisodes(
        visibleItems
          .filter((item) => dayKeyInZone(new Date(item.airingAt), timeZone) === dayKey)
          .sort((a, b) => new Date(a.airingAt).getTime() - new Date(b.airingAt).getTime())
      );
    });
  }, [visibleItems, weekDays, timeZone]);

  const myListCountThisWeek = useMemo(() => items.filter((item) => item.inMyList).length, [items]);

  function chooseMine() {
    // Visitante: "Minha Lista" pede login (com retorno ao calendário).
    if (user === null) {
      router.push(loginHref("/calendar"));
      return;
    }
    setShowAll(false);
  }

  const delayedItems = useMemo(() => visibleItems.filter((i) => i.delayed), [visibleItems]);

  const weekKeys = useMemo(() => new Set(weekDays.map((d) => dayKeyInZone(d, timeZone))), [weekDays, timeZone]);
  const visibleOffGrid = useMemo(() => offGrid.filter((o) => showAll || o.inMyList), [offGrid, showAll]);
  const noTimeItems = useMemo(
    () => visibleOffGrid.filter((o) => o.kind === "dated" && o.startDate !== null && weekKeys.has(o.startDate)),
    [visibleOffGrid, weekKeys]
  );
  const noDateItems = useMemo(() => visibleOffGrid.filter((o) => o.kind !== "dated"), [visibleOffGrid]);

  /** "Sex 09, 21:00" — o dia/horário original preservado do atrasado. */
  function previousSlot(item: CalendarItem): string {
    const d = new Date(item.airingAt);
    const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(d).replace(".", "").replace(/^./, (c) => c.toUpperCase());
    const day = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" }).format(d);
    return `${weekday} ${day}, ${formatTimeInZone(d, timeZone)}`;
  }

  /** "Domingo, 11 out" do dia civil `YYYY-MM-DD` (sem fuso — é uma data, não um instante). */
  function civilLabel(day: string): string {
    const d = new Date(`${day}T12:00:00Z`);
    const weekday = weekdayName(d, "UTC");
    const rest = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" }).format(d).replace(".", "");
    return `${weekday}, ${rest.replace(" de ", " ")}`;
  }

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer fluid>
        <PageIntro
          kicker="予定 / AGENDA SEMANAL"
          title="CALENDÁRIO"
          subtitle={
            <>
              <span suppressHydrationWarning>{weekRangeLabel}</span> · Horários locais em{" "}
              <span suppressHydrationWarning data-testid="calendar-timezone">
                {timeZone}
              </span>
              {myListCountThisWeek > 0 && (
                <>
                  {" "}
                  · {myListCountThisWeek} lançamento{myListCountThisWeek > 1 ? "s" : ""} da sua lista nesta semana
                </>
              )}
            </>
          }
          action={
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                onClick={() => setWeekOffset((w) => Math.max(-MAX_WEEK_OFFSET, w - 1))}
                disabled={weekOffset <= -MAX_WEEK_OFFSET || loading}
                startIcon={<ChevronLeftIcon />}
                sx={buttonSx()}
              >
                Semana anterior
              </Button>
              <Button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0} sx={buttonSx()}>
                Hoje
              </Button>
              <Button
                onClick={() => setWeekOffset((w) => Math.min(MAX_WEEK_OFFSET, w + 1))}
                disabled={weekOffset >= MAX_WEEK_OFFSET || loading}
                endIcon={<ChevronRightIcon />}
                sx={buttonSx()}
              >
                Próxima semana
              </Button>
            </Box>
          }
        />

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box role="group" aria-label="Filtro da agenda" sx={{ display: "flex", gap: 1 }}>
            <Button onClick={chooseMine} aria-pressed={!showAll} startIcon={user === null ? <LockOutlinedIcon /> : undefined} sx={buttonSx(!showAll)}>
              Minha Lista
            </Button>
            <Button onClick={() => setShowAll(true)} aria-pressed={showAll} sx={buttonSx(showAll)}>
              Todos
            </Button>
          </Box>
          {user === null && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Visitante · Minha Lista pede login</Typography>}
        </Box>

        {loading ? (
          <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Carregando calendário...</Typography>
        ) : error ? (
          <ErrorNotice title={error} onRetry={() => setReloadKey((k) => k + 1)}>
            A semana e o filtro foram mantidos.
          </ErrorNotice>
        ) : (
          <>
            {/* Em telas estreitas a grade rola na horizontal (colunas com largura mínima). */}
            <Box sx={{ overflowX: "auto", pb: 1 }}>
              <Box
                key={`${weekOffset}-${showAll}`}
                className="animate-fade-in"
                data-testid="calendar-grid"
                sx={{
                  // Base de tipografia da grade: 14 px a 1440 px de largura, crescendo até 22 px
                  // (monitores largos); tudo abaixo está em `em`.
                  "--u": "clamp(14px, 0.9722vw, 22px)",
                  fontSize: "var(--u)",
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: "1px",
                  minHeight: "33.93em",
                  minWidth: { xs: 760, md: 0 },
                  borderRadius: "0.857em",
                  overflow: "hidden",
                  bgcolor: "background.default",
                } as Record<string, unknown>}
              >
                {weekDays.map((day, i) => (
                  <CalendarDayColumn
                    key={day.toISOString()}
                    day={day}
                    items={itemsByDay[i]}
                    isToday={dayKeyInZone(day, timeZone) === todayKey}
                    timeZone={timeZone}
                    onFollowed={markFollowed}
                    onPendingChange={markPending}
                    highlightMine={showAll}
                  />
                ))}
              </Box>
            </Box>

            {visibleItems.length === 0 && (
              <Typography sx={{ color: "text.secondary", fontSize: 14 }} data-testid="calendar-empty">
                {showAll ? "Nenhum lançamento previsto nesta semana." : "Nada da sua lista nesta semana. Veja Todos para o resto da programação."}
              </Typography>
            )}

            {delayedItems.length > 0 && (
              <Box
                data-testid="calendar-delayed-alert"
                sx={{ display: "flex", gap: 2, p: 2.5, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}
              >
                <InfoOutlinedIcon sx={{ fontSize: 20, color: "warning.main", mt: 0.25 }} />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
                  <Typography component="h2" sx={{ fontSize: 16, lineHeight: 1.5 }}>
                    Previsão atrasada
                  </Typography>
                  {delayedItems.map((item) => (
                    <Typography key={item.key} sx={{ fontSize: 14, color: "text.secondary" }}>
                      <span lang={item.titleNative ? "ja" : undefined}>{resolveTitleText(preference, item) || "Sem título"}</span> ·{" "}
                      <span suppressHydrationWarning>{previousSlot(item)}</span> · EP{String(item.episode).padStart(2, "0")}. A previsão original é
                      preservada, mas o lançamento ainda não foi confirmado. Não foi deslocado para um horário inventado.
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {(noTimeItems.length > 0 || noDateItems.length > 0) && (
              <Box
                data-testid="calendar-off-grid"
                sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}
              >
                {noTimeItems.length > 0 && (
                  <Box component="section" aria-labelledby="calendar-no-time" sx={panelSx}>
                    <Typography id="calendar-no-time" component="h2" sx={{ fontSize: 18, lineHeight: 1.5, textTransform: "uppercase" }}>
                      Sem horário definido
                    </Typography>
                    {noTimeItems.map((item) => (
                      <Box key={item.key} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <StateChip icon={<EventNoteIcon />}>DATA CONHECIDA</StateChip>
                        <OffGridTitle item={item} />
                        <Typography sx={{ fontSize: 16 }}>
                          {civilLabel(item.startDate!)}
                          {item.episode ? ` · EP${String(item.episode).padStart(2, "0")}` : ""}
                        </Typography>
                        <Typography sx={{ fontSize: 16, color: "text.secondary" }}>
                          Horário ainda não informado. Não ocupa uma posição na grade.
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                {noDateItems.length > 0 && (
                  <Box component="section" aria-labelledby="calendar-no-date" sx={panelSx}>
                    <Typography id="calendar-no-date" component="h2" sx={{ fontSize: 18, lineHeight: 1.5, textTransform: "uppercase" }}>
                      Data não definida
                    </Typography>
                    {noDateItems.map((item) => (
                      <Box key={item.key} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <OffGridTitle item={item} />
                        {item.kind === "postponed" ? (
                          <StateChip tone="warning" icon={<EventRepeatIcon />}>
                            Adiado · nova data a confirmar
                          </StateChip>
                        ) : (
                          <StateChip icon={<EventBusyIcon />}>Data não definida</StateChip>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </PageContainer>
    </Box>
  );
}
