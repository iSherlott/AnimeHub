"use client";

import { useMemo, useState, type ReactNode } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import EventNoteIcon from "@mui/icons-material/EventNote";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Button, Link as MuiLink, Typography } from "@mui/material";
import { ELEVATED_BUTTON_SX, lineLang, PrimaryTitle, useTitleLines } from "@/components/ExploreCard";
import { SearchField, SelectField } from "@/components/FilterField";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { ListRow } from "@/components/ListRow";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useWindowedList } from "@/lib/useWindowedList";
import type { MyListEntry } from "@/lib/myList";
import { rowTimeLabel, sectionsByRelease } from "@/lib/myListGroups";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { formatTimeInZone, weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

export type { MyListEntry } from "@/lib/myList";

/** Quantos animes aparecem de cada vez em Minha Lista (o resto vem ao rolar). */
const LIST_WINDOW = 30;

type SortMode = "next" | "recent" | "title";

const STATUS_LABELS: Record<string, string> = {
  RELEASING: "Em exibição",
  NOT_YET_RELEASED: "Em breve",
  FINISHED: "Finalizado",
  HIATUS: "Adiado",
  CANCELLED: "Cancelado",
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "Espera": põe a obra em modo de espera (ou a retoma). Em espera ela continua na lista e no perfil, mas é uma obra que
 * a pessoa não vai acompanhar no lançamento (já viu alguns episódios) — sai do calendário "Minha Lista", dos alertas
 * e de "Para assistir". Sem confirmação: é reversível com o mesmo botão.
 */
function WaitButton({ entry }: { entry: MyListEntry }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${entry.id}/waiting`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waiting: !entry.waiting }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível salvar. Tente novamente.");
        return;
      }
      router.refresh();
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
      <Button
        onClick={() => void toggle()}
        disabled={busy}
        startIcon={entry.waiting ? <PauseCircleIcon /> : <PauseCircleOutlineIcon />}
        aria-pressed={entry.waiting}
        title={entry.waiting ? "Em espera — clique para voltar a acompanhar" : "Pôr em espera: não vou acompanhar no lançamento"}
        data-testid="wait-toggle"
        sx={{ ...ELEVATED_BUTTON_SX, ...(entry.waiting ? { color: "warning.main", border: 1, borderColor: "warning.main" } : {}) }}
      >
        Espera
      </Button>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Obra que já terminou de ser exibida: em vez de "Espera", a pessoa diz em que pé está — "Terminei" (já vi tudo) ou
 * "Não terminei" (fica em espera, fora da agenda e dos alertas). Os mesmos nomes do andamento no resto do site (álbuns
 * do perfil). Clicar de novo desfaz.
 */
function FinishedChoice({ entry }: { entry: MyListEntry }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = entry.watchState === "FINISHED";
  const pending = entry.watchState === "UNFINISHED" || entry.waiting;

  async function choose(kind: "FINISHED" | "PENDING") {
    setBusy(true);
    setError(null);
    const on = kind === "FINISHED" ? finished : pending;
    const body = kind === "FINISHED" ? { state: on ? null : "FINISHED", waiting: false } : { state: on ? null : "UNFINISHED", waiting: !on };
    try {
      const res = await fetch(`/api/anime/${entry.id}/watch-state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível salvar. Tente novamente.");
        return;
      }
      router.refresh();
    } catch {
      setError("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
      <Box role="group" aria-label="Andamento da obra finalizada" sx={{ display: "inline-flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          onClick={() => void choose("FINISHED")}
          disabled={busy}
          startIcon={<CheckCircleIcon />}
          aria-pressed={finished}
          title="Já vi tudo"
          data-testid={`finished-done-${entry.anilistId ?? entry.id}`}
          sx={{ ...ELEVATED_BUTTON_SX, ...(finished ? { color: "success.main", border: 1, borderColor: "success.main" } : {}) }}
        >
          Terminei
        </Button>
        <Button
          onClick={() => void choose("PENDING")}
          disabled={busy}
          startIcon={pending ? <PauseCircleIcon /> : <PauseCircleOutlineIcon />}
          aria-pressed={pending}
          title="Ainda não terminei: fica em espera"
          data-testid={`finished-pending-${entry.anilistId ?? entry.id}`}
          sx={{ ...ELEVATED_BUTTON_SX, ...(pending ? { color: "warning.main", border: 1, borderColor: "warning.main" } : {}) }}
        >
          Não terminei
        </Button>
      </Box>
      {error && (
        <Typography role="alert" sx={{ fontSize: 12, color: "primary.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

/** O controle certo para cada obra: terminada = Terminei/Não terminei; no ar ou por estrear = Espera. Obra com várias temporadas conta como uma só. */
function EntryAction({ entry }: { entry: MyListEntry }) {
  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", gap: 0.75, alignItems: "flex-start" }}>
      {entry.seasonsCount > 1 && (
        <Typography data-testid={`seasons-count-${entry.anilistId ?? entry.id}`} sx={{ fontSize: 12, color: "text.secondary" }}>
          {entry.seasonsCount} temporadas
        </Typography>
      )}
      {entry.status === "FINISHED" ? <FinishedChoice entry={entry} /> : <WaitButton entry={entry} />}
    </Box>
  );
}

function Chip({ tone = "neutral", icon, children }: { tone?: "neutral" | "warning"; icon: ReactNode; children: ReactNode }) {
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
      <Typography suppressHydrationWarning component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.5, color: "inherit" }}>
        {children}
      </Typography>
    </Box>
  );
}

const panelSx = {
  display: "flex",
  flexDirection: "column",
  gap: 2.5,
  p: 3,
  borderRadius: "16px",
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  minWidth: 0,
} as const;

/** Título (nativo em destaque) + apoio, como link para o detalhe pessoal. */
function EntryTitle({ entry, size = 20 }: { entry: MyListEntry; size?: number }) {
  const titleLines = useTitleLines(entry);
  const { secondary, primaryLang } = titleLines;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 }}>
      <Typography lang={primaryLang} sx={{ fontSize: size, fontWeight: 700, lineHeight: 1.4, overflowWrap: "anywhere" }}>
        <MuiLink component={NextLink} href={`/anime/${entry.id}`} underline="hover" color="inherit">
          <PrimaryTitle lines={titleLines} />
        </MuiLink>
      </Typography>
      {secondary.map((line) => (
        <Typography key={line} lang={lineLang(line)} sx={{ fontSize: 13, color: "text.secondary" }}>
          {line}
        </Typography>
      ))}
    </Box>
  );
}

/**
 * Minha Lista (Figma `8:2608`): agrupada por data do próximo lançamento
 * (hoje, depois de hoje) e, fora da grade, "Sem horário definido",
 * "Adiado / Atrasado" e "Data não definida" — nunca com horário inventado.
 * Com busca, ordenação e status. Privada e sem qualquer métrica de consumo.
 */
export function MyListView({ entries }: { entries: MyListEntry[] }) {
  const { preference } = useTitlePreference();
  const timeZone = useTimeZone();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("next");
  const [status, setStatus] = useState("");

  const statuses = useMemo(() => Array.from(new Set(entries.map((e) => e.status).filter((s): s is string => s !== null && s in STATUS_LABELS))), [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (status && e.status !== status) return false;
      if (!needle) return true;
      return [e.titleRomaji, e.titleEnglish, e.titleNative, e.titlePortuguese].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [entries, query, status]);

  const now = new Date();

  // Em espera: continuam na lista, mas fora da agenda por data (têm painel próprio).
  const active = useMemo(() => visible.filter((e) => !e.waiting), [visible]);
  const waitingEntries = visible.filter((e) => e.waiting);

  const sections = useMemo(() => {
    const timed = active.flatMap((entry) => (entry.state.kind === "scheduled" ? [{ at: entry.state.at, entry, episode: entry.state.episode }] : []));
    return sectionsByRelease(timed, new Date(), timeZone);
  }, [active, timeZone]);
  const noTime = active.filter((e) => e.state.kind === "dated");
  const delayed = active.filter((e) => e.state.kind === "delayed" || e.state.kind === "postponed");
  const unknown = active.filter((e) => e.state.kind === "undated" || e.state.kind === "none");

  function renderRow(item: { at: string; entry: MyListEntry; episode: number }) {
    return (
      <ListRow
        key={item.entry.id}
        testId={`anime-card-${item.entry.id}`}
        timeTestId="card-next"
        href={`/anime/${item.entry.id}`}
        time={rowTimeLabel(item.at, now, timeZone)}
        episodeLabel={`Episódio ${pad(item.episode)}`}
        cover={item.entry.coverImage}
        titles={item.entry}
        trailing={<EntryAction entry={item.entry} />}
      />
    );
  }

  function stateText(entry: MyListEntry): string {
    switch (entry.state.kind) {
      case "dated":
        return "Sem horário";
      case "delayed":
        return "Atrasado";
      case "postponed":
        return "Adiado";
      case "none":
        return "Sem lançamentos";
      default:
        return "Data não definida";
    }
  }

  const flat = useMemo(() => {
    if (sort === "next") return null;
    return [...visible].sort((a, b) =>
      sort === "recent"
        ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
        : resolveTitleText(preference, a).localeCompare(resolveTitleText(preference, b), "pt-BR")
    );
  }, [visible, sort, preference]);

  // Rolagem infinita: a lista pode ter centenas de obras, então os cartões aparecem aos poucos, na ordem em que estão na tela
  // (agenda por data, sem horário, atrasados, sem data e, por último, em espera). Cada grupo mostra a parte que couber.
  const rowOrder = useMemo(
    () => (flat ? flat : [...sections.flatMap((s) => s.items.map((i) => i.entry)), ...noTime, ...delayed, ...unknown, ...waitingEntries]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flat, sections, active, visible]
  );
  const windowed = useWindowedList(rowOrder, `${query}|${sort}|${status}`, LIST_WINDOW);
  const { ref: sentinelRef, supported: infiniteSupported } = useInfiniteScroll(windowed.loadMore, windowed.hasMore, windowed.shown);
  let budget = windowed.shown;
  const take = <T,>(list: T[]): T[] => {
    const part = list.slice(0, budget);
    budget -= part.length;
    return part;
  };
  const flatShown = flat ? take(flat) : [];
  const shownSections = flat ? [] : sections.map((section) => ({ ...section, items: take(section.items) })).filter((section) => section.items.length > 0);
  const noTimeShown = flat ? [] : take(noTime);
  const delayedShown = flat ? [] : take(delayed);
  const unknownShown = flat ? [] : take(unknown);
  const waitingShown = flat ? [] : take(waitingEntries);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
        <SearchField label="Buscar na minha lista" value={query} onChange={setQuery} placeholder="Buscar anime..." />
        <SelectField
          label="Ordenação"
          value={sort}
          onChange={(v) => setSort(v as SortMode)}
          width={260}
          testId="sort-select"
          options={[
            { value: "next", label: "Próximo lançamento" },
            { value: "recent", label: "Adicionados recentemente" },
            { value: "title", label: "Título" },
          ]}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={setStatus}
          width={204}
          options={[{ value: "", label: "Todos" }, ...statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
        />
      </Box>

      {visible.length === 0 ? (
        <Typography sx={{ color: "text.secondary" }}>Nenhum anime da sua lista bate com essa busca.</Typography>
      ) : flat ? (
        <Box data-testid="group-all" sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Typography component="h2" sx={{ fontSize: 24, lineHeight: 1.5 }}>
            {sort === "recent" ? "Adicionados recentemente" : "Em ordem alfabética"}
          </Typography>
          <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 0, m: 0 }}>
            {flatShown.map((entry) =>
              entry.state.kind === "scheduled" ? (
                renderRow({ at: entry.state.at, entry, episode: entry.state.episode })
              ) : (
                <ListRow
                  key={entry.id}
                  testId={`anime-card-${entry.id}`}
                  timeTestId="card-next"
                  href={`/anime/${entry.id}`}
                  time={stateText(entry)}
                  cover={entry.coverImage}
                  titles={entry}
                  trailing={<EntryAction entry={entry} />}
                />
              )
            )}
          </Box>
        </Box>
      ) : (
        <>
          {shownSections.map((section, index) => {
            const firstNested = section.nested && !shownSections.slice(0, index).some((s) => s.nested);
            return (
              <Box key={section.key} data-testid={`group-${section.key}`} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                {firstNested && (
                  <Typography component="h2" sx={{ fontSize: 24, lineHeight: 1.5, mt: 1 }}>
                    Depois de hoje
                  </Typography>
                )}
                {section.nested ? (
                  <Typography component="h3" sx={{ fontSize: 13, color: "text.secondary" }}>
                    {section.label}
                  </Typography>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    <Typography component="h2" sx={{ fontSize: 24, lineHeight: 1.5 }}>
                      {section.label}
                    </Typography>
                    {section.badge && (
                      <Box sx={{ px: 1, py: 0.75, borderRadius: "6px", bgcolor: "#2c111b" }}>
                        <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: "primary.main", whiteSpace: "nowrap" }}>
                          {section.badge}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}
                <Box component="ul" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 0, m: 0 }}>
                  {section.items.map(renderRow)}
                </Box>
              </Box>
            );
          })}

          {(noTimeShown.length > 0 || delayedShown.length > 0) && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
              {noTimeShown.length > 0 && (
                <Box component="section" aria-labelledby="my-no-time" data-testid="group-no-time" sx={panelSx}>
                  <Typography id="my-no-time" component="h2" sx={{ fontSize: 18, textTransform: "uppercase" }}>
                    Sem horário definido
                  </Typography>
                  {noTimeShown.map((entry) => (
                    <Box key={entry.id} data-testid={`anime-card-${entry.id}`} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      <EntryTitle entry={entry} />
                      {entry.state.kind === "dated" && (
                        <Typography suppressHydrationWarning sx={{ fontSize: 16 }}>
                          {datedLabel(entry.state.day)}
                          {entry.state.episode ? ` · EP${pad(entry.state.episode)}` : ""}
                        </Typography>
                      )}
                      <Chip icon={<EventNoteIcon />}>Horário não definido</Chip>
                      <Box>
                        <EntryAction entry={entry} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
              {delayedShown.length > 0 && (
                <Box component="section" aria-labelledby="my-delayed" data-testid="group-delayed" sx={panelSx}>
                  <Typography id="my-delayed" component="h2" sx={{ fontSize: 18, textTransform: "uppercase" }}>
                    Adiado / Atrasado
                  </Typography>
                  {delayedShown.map((entry) => (
                    <Box key={entry.id} data-testid={`anime-card-${entry.id}`} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      <EntryTitle entry={entry} />
                      {entry.state.kind === "delayed" ? (
                        <>
                          <Chip tone="warning" icon={<WarningAmberIcon />}>
                            Atrasado · previsão {previousSlot(entry.state.at, timeZone)}
                          </Chip>
                          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Não atribuir novo horário sem confirmação da fonte.</Typography>
                        </>
                      ) : (
                        <Chip tone="warning" icon={<EventRepeatIcon />}>
                          Adiado · nova data a confirmar
                        </Chip>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {unknownShown.length > 0 && (
            <Box component="section" aria-labelledby="my-unknown" data-testid="group-unknown" sx={panelSx}>
              <Typography id="my-unknown" component="h2" sx={{ fontSize: 18, textTransform: "uppercase" }}>
                Data não definida
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" }, gap: 3 }}>
                {unknownShown.map((entry) => (
                  <Box
                    key={entry.id}
                    data-testid={`anime-card-${entry.id}`}
                    sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2.5, borderRadius: "12px", border: 1, borderColor: "divider", minWidth: 0 }}
                  >
                    <EntryTitle entry={entry} />
                    <Chip icon={<EventBusyIcon />}>{entry.state.kind === "none" ? "Sem lançamentos previstos" : "Data não definida"}</Chip>
                    <Box>
                      <EntryAction entry={entry} />
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {waitingShown.length > 0 && (
            <Box component="section" aria-labelledby="my-waiting" data-testid="group-waiting" sx={panelSx}>
              <Typography id="my-waiting" component="h2" sx={{ fontSize: 18, textTransform: "uppercase" }}>
                Em espera
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                Não acompanho no lançamento. Continuam na lista e no perfil; fora do calendário e dos alertas.
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" }, gap: 3 }}>
                {waitingShown.map((entry) => (
                  <Box
                    key={entry.id}
                    data-testid={`anime-card-${entry.id}`}
                    sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2.5, borderRadius: "12px", border: 1, borderColor: "divider", minWidth: 0 }}
                  >
                    <EntryTitle entry={entry} />
                    <Chip icon={<PauseCircleOutlineIcon />}>{entry.watchState === "DROPPED" ? "Dropei" : "Em espera"}</Chip>
                    <Box>
                      <EntryAction entry={entry} />
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </>
      )}
      <InfiniteFooter
        testId="mylist"
        sentinelRef={sentinelRef}
        supported={infiniteSupported}
        hasMore={windowed.hasMore}
        loadingMore={false}
        failed={false}
        onMore={windowed.loadMore}
        onRetry={windowed.loadMore}
        moreLabel="Ver mais da minha lista"
      />
    </Box>
  );
}

function datedLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const rest = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" }).format(d).replace(".", "").replace(" de ", " ");
  return `${weekdayName(d, "UTC")}, ${rest}`;
}

function previousSlot(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const dm = new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "short" }).format(d).replace(".", "").replace(" de ", " ");
  return `${dm}, ${formatTimeInZone(d, timeZone)}`;
}
