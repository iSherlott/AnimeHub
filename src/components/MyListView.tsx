"use client";

import { useEffect, useMemo, useState } from "react";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import EventNoteIcon from "@mui/icons-material/EventNote";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlined";
import { Box, Typography } from "@mui/material";
import { SearchField, SelectField } from "@/components/FilterField";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { ListRow } from "@/components/ListRow";
import { readSession, useCameBack, useScrollMemory, writeSession } from "@/lib/useScrollMemory";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useWindowedList } from "@/lib/useWindowedList";
import type { MyListEntry } from "@/lib/myList";
import { rowTimeLabel, sectionsByRelease } from "@/lib/myListGroups";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import { weekdayName } from "@/lib/timeZone";
import { useTimeZone } from "@/lib/useTimeZone";

import { EntryAction, Chip, EntryTitle, panelSx } from "@/components/MyListParts";

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
 * Minha Lista (Figma `8:2608`): agrupada por data do próximo lançamento
 * (hoje, depois de hoje) e, fora da grade, "Sem horário definido",
 * "Adiado" e "Data não definida" — nunca com horário inventado (o "Atrasado"
 * saiu em 28/10: os atrasos vão ser cuidados por um agente próprio).
 * Com busca, ordenação e status. Privada e sem qualquer métrica de consumo.
 */
export function MyListView({ entries }: { entries: MyListEntry[] }) {
  const { preference } = useTitlePreference();
  const timeZone = useTimeZone();
  // Ao voltar da página de uma obra, a busca, a ordem, o filtro e a rolagem voltam como estavam.
  const cameBack = useCameBack();
  const [saved] = useState(() => (cameBack ? readSession<{ query: string; sort: SortMode; status: string }>("my-list:view") : null));
  const [query, setQuery] = useState(saved?.query ?? "");
  const [sort, setSort] = useState<SortMode>(saved?.sort ?? "next");
  const [status, setStatus] = useState(saved?.status ?? "");
  useEffect(() => writeSession("my-list:view", { query, sort, status }), [query, sort, status]);
  useScrollMemory("/minha-lista", true);

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
  const delayed = active.filter((e) => e.state.kind === "postponed");
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
                    Adiado
                  </Typography>
                  {delayedShown.map((entry) => (
                    <Box key={entry.id} data-testid={`anime-card-${entry.id}`} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                      <EntryTitle entry={entry} />
                      <Chip tone="warning" icon={<EventRepeatIcon />}>
                        Adiado · nova data a confirmar
                      </Chip>
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
