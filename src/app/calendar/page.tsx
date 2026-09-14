"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Header } from "@/components/Header";
import { CalendarDayColumn } from "@/components/CalendarDayColumn";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { CalendarItem } from "@/lib/calendarItem";

const MAX_WEEK_OFFSET = 8;

/**
 * Semana fixa de calendário (Dom→Sáb), ancorada no domingo da semana atual
 * — não uma janela rolante de "hoje + 6 dias", que mudaria de recorte
 * dependendo do dia em que a página fosse aberta.
 */
function buildWeekDays(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(sunday.getDate() - sunday.getDay() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const user = useCurrentUser();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAll, setShowAllRaw] = useState(false);
  const userTouchedToggle = useRef(false);

  function setShowAll(value: boolean) {
    userTouchedToggle.current = true;
    setShowAllRaw(value);
  }

  useEffect(() => {
    // Sem login não existe "minha lista" pra mostrar — evita a tela ficar
    // sempre vazia por padrão pra quem não está logado. Se a pessoa já
    // mexeu no toggle manualmente, não sobrescreve a escolha dela. A receita
    // de ajustar isso durante a renderização via ref não se aplica aqui —
    // o lint react-hooks/refs deste projeto (mira compatibilidade com o
    // React Compiler) proíbe acessar ref.current fora de efeito/handler.
    if (userTouchedToggle.current) return;
    if (user === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAllRaw(true);
    }
  }, [user]);

  const weekDays = useMemo(() => buildWeekDays(weekOffset), [weekOffset]);
  const todayKey = useMemo(() => new Date().toDateString(), []);

  useEffect(() => {
    let cancelled = false;
    // Mostra "carregando" de novo assim que a semana muda, antes mesmo da
    // busca terminar — o exemplo canônico de "buscar dados num efeito" dos
    // docs do React (react.dev/learn/you-might-not-need-an-effect) já é
    // exatamente essa forma; sem adotar uma lib de fetch, não tem como
    // sinalizar "comecei a carregar" sem chamar setState aqui.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    // O início da semana (domingo 00:00 no fuso do navegador) é enviado como
    // timestamp absoluto — o servidor não deve recalcular "hoje" com o
    // próprio relógio, porque server e navegador podem estar em fusos
    // diferentes e discordar sobre qual semana é a atual.
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
  }, [weekOffset, weekDays]);

  const weekRangeLabel = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekDays]);

  const itemsByDay = useMemo(() => {
    return weekDays.map((day) => {
      const dayKey = day.toDateString();
      return items
        .filter((item) => new Date(item.airingAt).toDateString() === dayKey)
        .sort((a, b) => new Date(a.airingAt).getTime() - new Date(b.airingAt).getTime());
    });
  }, [items, weekDays]);

  const myListCountThisWeek = useMemo(
    () => items.filter((item) => item.inMyList).length,
    [items]
  );

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />

      <Box sx={{ borderBottom: 1, borderColor: "divider", px: { xs: 3, sm: 5 }, py: 4 }}>
        <Typography variant="h3" component="h1" className="font-display" sx={{ textTransform: "uppercase" }}>
          Calendário
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
          {myListCountThisWeek > 0
            ? `${myListCountThisWeek} lançamento${myListCountThisWeek > 1 ? "s" : ""} da sua lista nesta semana.`
            : "Episódios com data e horário de exibição confirmados."}
        </Typography>

        <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap", alignItems: "center" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <IconButton
              onClick={() => setWeekOffset((w) => Math.max(-MAX_WEEK_OFFSET, w - 1))}
              disabled={weekOffset <= -MAX_WEEK_OFFSET || loading}
              size="small"
              aria-label="Semana anterior"
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" className="font-display" sx={{ minWidth: 96, textAlign: "center", textTransform: "uppercase", color: "text.secondary" }}>
              {weekOffset === 0 ? "Esta semana" : weekRangeLabel}
            </Typography>
            <IconButton
              onClick={() => setWeekOffset((w) => Math.min(MAX_WEEK_OFFSET, w + 1))}
              disabled={weekOffset >= MAX_WEEK_OFFSET || loading}
              size="small"
              aria-label="Próxima semana"
            >
              <ArrowForwardIcon fontSize="small" />
            </IconButton>
            {weekOffset !== 0 && (
              <Button onClick={() => setWeekOffset(0)} size="small" color="inherit">
                Voltar para hoje
              </Button>
            )}
          </Stack>

          <ToggleButtonGroup
            value={showAll ? "all" : "mine"}
            exclusive
            onChange={(_, value) => {
              if (value !== null) setShowAll(value === "all");
            }}
            size="small"
            sx={{ ml: { sm: "auto" } }}
          >
            <ToggleButton value="mine">★ Minha lista</ToggleButton>
            <ToggleButton value="all">Todos os lançamentos</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Box>

      <Box sx={{ px: { xs: 3, sm: 5 }, py: 3 }}>
        {loading ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Carregando calendário...
          </Typography>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <div
            key={`${weekOffset}-${showAll}`}
            className="animate-fade-in grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-7"
          >
            {weekDays.map((day, i) => (
              <CalendarDayColumn
                key={day.toISOString()}
                day={day}
                items={itemsByDay[i]}
                showAll={showAll}
                isToday={day.toDateString() === todayKey}
              />
            ))}
          </div>
        )}
      </Box>
    </div>
  );
}
