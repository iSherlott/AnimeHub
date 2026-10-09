"use client";

import { useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Skeleton, Stack, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { LocalDateTime } from "@/components/LocalDateTime";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import type { CalendarItem } from "@/lib/calendarItem";
import { dayKeyInZone, formatTimeInZone, startOfWeekMondayInZone } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { loginHref } from "@/lib/safeRedirect";

/**
 * "Seu dia, em anime." (Figma `8:2442`, D-05): o que lança hoje da SUA lista
 * e qual é o próximo horário. Acesso pelo logo. Contadores nunca viram "0"
 * enquanto carregam nem quando a busca falha (`8:5323`, `8:5448`), e
 * "Minha lista" conta vínculos — não consumo.
 */
type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; items: CalendarItem[]; followCount: number };

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
      fetch("/api/anime"),
    ])
      .then(async ([w0, w1, list]) => {
        if (!w0.ok || !w1.ok || !list.ok) throw new Error("falha");
        const [a, b, l] = await Promise.all([w0.json(), w1.json(), list.json()]);
        if (cancelled) return;
        const items: CalendarItem[] = [...(a.results ?? []), ...(b.results ?? [])];
        setState({ kind: "ready", items, followCount: (l.animes ?? []).length });
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
    const later = mine.filter((i) => new Date(i.airingAt) > now && !isToday(i)).slice(0, 6);
    const available = today.filter((i) => new Date(i.airingAt) <= now);
    return { today, later, available };
  }, [state, timeZone]);

  const retry = () => {
    setState({ kind: "loading" });
    setReloadKey((k) => k + 1);
  };

  const todayLabel = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <Box component="main" sx={{ px: { xs: 3, sm: 5 }, py: 4, maxWidth: 960 }}>
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }} suppressHydrationWarning>
          {todayLabel}
        </Typography>
        <Typography variant="h3" component="h1" className="font-display" sx={{ textTransform: "uppercase" }}>
          Seu dia, em anime.
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          Os lançamentos da sua lista. Sem perder de vista o próximo horário.
        </Typography>
        <Button component={NextLink} href="/calendar" variant="outlined" size="small" sx={{ mt: 2 }}>
          Abrir calendário
        </Button>

        {state.kind === "error" && (
          <Alert
            severity="error"
            role="alert"
            sx={{ mt: 3 }}
            action={
              <Button color="inherit" size="small" onClick={retry}>
                Tentar novamente
              </Button>
            }
          >
            Não foi possível carregar os lançamentos. Sua lista está segura — tente novamente para consultar os horários de hoje.
          </Alert>
        )}

        {(state.kind === "loading" || user === undefined) && (
          <Box aria-busy="true" sx={{ mt: 3 }} data-testid="dashboard-loading">
            <Stack direction="row" spacing={2}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rectangular" animation={false} width={160} height={72} />
              ))}
            </Stack>
            <Skeleton variant="rectangular" animation={false} height={56} sx={{ mt: 2 }} />
            <Skeleton variant="rectangular" animation={false} height={56} sx={{ mt: 1 }} />
          </Box>
        )}

        {state.kind === "ready" && view && (
          <>
            <Stack direction="row" spacing={2} sx={{ mt: 3, flexWrap: "wrap", rowGap: 2 }} data-testid="dashboard-counters">
              <Counter label="Hoje" value={view.today.length} hint="lançamentos" id="today" />
              <Counter label="Novos episódios" value={view.available.length} hint="já disponíveis" id="available" />
              <Counter label="Minha lista" value={state.followCount} hint="animes acompanhando" id="following" />
            </Stack>

            <Box component="section" aria-labelledby="hoje-heading" sx={{ mt: 4 }}>
              <Typography id="hoje-heading" variant="h6" component="h2" sx={{ textTransform: "uppercase", mb: 1 }}>
                Hoje
              </Typography>
              {view.today.length === 0 ? (
                <Typography sx={{ color: "text.secondary" }} data-testid="today-empty">
                  Nenhum lançamento da sua lista hoje.
                </Typography>
              ) : (
                <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }} data-testid="today-list">
                  {view.today.map((item) => (
                    <Row key={item.key} item={item} title={resolveTitleText(preference, item) || "Sem título"} />
                  ))}
                </Stack>
              )}
            </Box>

            {view.later.length > 0 && (
              <Box component="section" aria-labelledby="depois-heading" sx={{ mt: 4 }}>
                <Typography id="depois-heading" variant="h6" component="h2" sx={{ textTransform: "uppercase", mb: 1 }}>
                  Depois de hoje
                </Typography>
                <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }} data-testid="later-list">
                  {view.later.map((item) => (
                    <Row key={item.key} item={item} title={resolveTitleText(preference, item) || "Sem título"} withDay />
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}
      </Box>
    </div>
  );
}

function Counter({ label, value, hint, id }: { label: string; value: number; hint: string; id: string }) {
  return (
    <Box sx={{ minWidth: 150, p: 2, border: 1, borderColor: "divider", borderRadius: 1 }} data-testid={`counter-${id}`}>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="h4" component="p" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {hint}
      </Typography>
    </Box>
  );
}

function Row({ item, title, withDay = false }: { item: CalendarItem; title: string; withDay?: boolean }) {
  const timeZone = useTimeZone();
  const time = formatTimeInZone(new Date(item.airingAt), timeZone);
  return (
    <li>
      <Box
        component={NextLink}
        href={item.animeId ? `/anime/${item.animeId}` : `/obra/${item.anilistId}`}
        sx={{
          display: "flex",
          alignItems: "baseline",
          gap: 2,
          p: 1.5,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          textDecoration: "none",
          color: "text.primary",
          "&:hover": { borderColor: "primary.main" },
        }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: 20, minWidth: 64 }} suppressHydrationWarning>
          {withDay ? <LocalDateTime iso={item.airingAt} compact /> : time}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", minWidth: 96 }}>
          Episódio {item.episode}
        </Typography>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      </Box>
    </li>
  );
}
