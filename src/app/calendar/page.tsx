"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Alert, Box, Button, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { CalendarDayColumn } from "@/components/CalendarDayColumn";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { CalendarItem } from "@/lib/calendarItem";
import { HOURS_PER_DAY } from "@/lib/calendarGrid";
import { loginHref } from "@/lib/safeRedirect";
import { buildWeekDaysInZone, dayKeyInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

const MAX_WEEK_OFFSET = 8;

/** Botão do Figma: "elevated" com borda (ou acento quando selecionado). */
const buttonSx = (selected = false) =>
  selected
    ? { bgcolor: "primary.main", color: "primary.contrastText", border: 1, borderColor: "primary.main", "&:hover": { bgcolor: "primary.dark" } }
    : { bgcolor: "#171820", color: "text.primary", border: 1, borderColor: "divider", "&:hover": { bgcolor: "#1d1e28" } };

/**
 * Calendário (Figma `8:2106`): agenda semanal em GRADE DE HORAS — eixo de
 * 00:00 a 22:00, sete colunas (segunda → domingo) e cada lançamento num bloco
 * posicionado pelo horário local. A grade ocupa a largura toda da tela e
 * escala com o monitor (ultrawide incluso): todas as medidas internas são em
 * `em`, e a base cresce de 14 px (1440 px) até 22 px.
 */
export default function CalendarPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const timeZone = useTimeZone();
  const [items, setItems] = useState<CalendarItem[]>([]);
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
      return visibleItems
        .filter((item) => dayKeyInZone(new Date(item.airingAt), timeZone) === dayKey)
        .sort((a, b) => new Date(a.airingAt).getTime() - new Date(b.airingAt).getTime());
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

  const hourLabels = Array.from({ length: HOURS_PER_DAY / 2 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`);

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
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
                Tentar novamente
              </Button>
            }
          >
            {error}. A semana e o filtro foram mantidos.
          </Alert>
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
                  // (monitores largos), e tudo abaixo está em `em`.
                  // --u é a unidade-base em px (sem em, para não mudar de valor dentro de filhos
                  // com outro font-size); --hh = altura de 1 hora (40 px quando --u = 14 px).
                  "--u": "clamp(14px, 0.9722vw, 22px)",
                  "--hh": "calc(var(--u) * 2.857)",
                  fontSize: "var(--u)",
                  display: "flex",
                  gap: "0.571em",
                  alignItems: "flex-start",
                  minWidth: { xs: 760, md: 0 },
                } as Record<string, unknown>}
              >
                <Box aria-hidden sx={{ width: "4em", flexShrink: 0 }}>
                  <Box sx={{ height: "4.571em" }} />
                  <Box sx={{ position: "relative", height: `calc(${HOURS_PER_DAY} * var(--hh))` }}>
                    {hourLabels.map((label, i) => (
                      <Typography
                        key={label}
                        sx={{ position: "absolute", left: 0, top: `calc(${i * 2} * var(--hh))`, fontSize: "0.857em", lineHeight: 1, color: "text.secondary" }}
                      >
                        {label}
                      </Typography>
                    ))}
                  </Box>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "0.571em" }}>
                  {weekDays.map((day, i) => (
                    <CalendarDayColumn
                      key={day.toISOString()}
                      day={day}
                      items={itemsByDay[i]}
                      isToday={dayKeyInZone(day, timeZone) === todayKey}
                      timeZone={timeZone}
                    />
                  ))}
                </Box>
              </Box>
            </Box>

            {visibleItems.length === 0 && (
              <Typography sx={{ color: "text.secondary", fontSize: 14 }} data-testid="calendar-empty">
                {showAll ? "Nenhum lançamento previsto nesta semana." : "Nada da sua lista nesta semana. Veja Todos para o resto da programação."}
              </Typography>
            )}
          </>
        )}
      </PageContainer>
    </Box>
  );
}
