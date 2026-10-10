import { weekdayName } from "@/lib/timeZone";

/**
 * Agrupamento de Minha Lista por data do próximo lançamento (Figma `8:2608`):
 * "Hoje", "Amanhã", dias da semana seguinte, "Depois" e "Sem previsão
 * confirmada". Nunca inventa data: sem episódio futuro conhecido o item vai
 * para o último grupo. Sem nenhuma noção de consumo (P-3).
 */
export type ListItemForGrouping = { nextAiringAt: string | null };

export type ReleaseGroup<T> = { key: string; label: string; items: T[] };

const DAY_MS = 24 * 3600 * 1000;

function dayKey(date: Date, timeZone: string): string {
  // en-CA formata como YYYY-MM-DD, estável para comparar dias no fuso dado.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayDiff(target: Date, now: Date, timeZone: string): number {
  const a = Date.parse(`${dayKey(target, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now, timeZone)}T00:00:00Z`);
  return Math.round((a - b) / DAY_MS);
}

export function groupByRelease<T extends ListItemForGrouping>(
  items: T[],
  now: Date,
  timeZone: string,
  locale = "pt-BR"
): ReleaseGroup<T>[] {
  const withDate = items
    .filter((i) => i.nextAiringAt)
    .sort((a, b) => Date.parse(a.nextAiringAt!) - Date.parse(b.nextAiringAt!));
  const withoutDate = items.filter((i) => !i.nextAiringAt);

  const groups: ReleaseGroup<T>[] = [];
  const index = new Map<string, ReleaseGroup<T>>();
  const push = (key: string, label: string, item: T) => {
    let group = index.get(key);
    if (!group) {
      group = { key, label, items: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  };

  for (const item of withDate) {
    const date = new Date(item.nextAiringAt!);
    const diff = dayDiff(date, now, timeZone);
    if (diff <= 0) push("today", "Hoje", item);
    else if (diff === 1) push("tomorrow", "Amanhã", item);
    else if (diff <= 7) {
      const label = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long" }).format(date);
      push(`day-${dayKey(date, timeZone)}`, label.charAt(0).toUpperCase() + label.slice(1), item);
    } else push("later", "Depois", item);
  }
  for (const item of withoutDate) push("unknown", "Sem previsão confirmada", item);
  return groups;
}

/** Seção de Minha Lista no modo "Próximo lançamento" (Figma `8:2608`). */
export type MyListSection<T> = {
  key: string;
  /** Título da seção ("Sábado, 10 outubro", "Amanhã · Domingo, 11 outubro", …). */
  label: string;
  /** Selo ao lado do título ("HOJE · 4 LANÇAMENTOS"). */
  badge?: string;
  /** Subseção dentro de "Depois de hoje". */
  nested: boolean;
  items: T[];
};

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Seções por data para itens COM horário confirmado: hoje; depois de hoje
 * (amanhã, os próximos dias numa faixa só, e cada dia a partir de uma semana).
 * Sem nenhuma data inventada — o que não tem horário vai para os painéis.
 */
export function sectionsByRelease<T extends { at: string }>(
  items: T[],
  now: Date,
  timeZone: string,
  locale = "pt-BR"
): MyListSection<T>[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...opts }).format(date).replace(/ de /g, " ").replace(/-feira/g, "");
  const today: T[] = [];
  const tomorrow: T[] = [];
  const week: T[] = [];
  const later = new Map<string, T[]>();
  for (const item of sorted) {
    const date = new Date(item.at);
    const diff = dayDiff(date, now, timeZone);
    if (diff <= 0) today.push(item);
    else if (diff === 1) tomorrow.push(item);
    else if (diff <= 6) week.push(item);
    else {
      const key = dayKey(date, timeZone);
      later.set(key, [...(later.get(key) ?? []), item]);
    }
  }

  const sections: MyListSection<T>[] = [];
  if (today.length) {
    sections.push({
      key: "today",
      label: cap(fmt(now, { weekday: "long", day: "numeric", month: "long" })),
      badge: `HOJE · ${today.length} ${today.length === 1 ? "LANÇAMENTO" : "LANÇAMENTOS"}`,
      nested: false,
      items: today,
    });
  }
  if (tomorrow.length) {
    sections.push({ key: "tomorrow", label: `Amanhã · ${cap(fmt(new Date(tomorrow[0].at), { weekday: "long", day: "numeric", month: "long" }))}`, nested: true, items: tomorrow });
  }
  if (week.length) {
    const first = new Date(week[0].at);
    const last = new Date(week[week.length - 1].at);
    const sameMonth = fmt(first, { month: "long" }) === fmt(last, { month: "long" });
    const range = sameMonth
      ? `${fmt(first, { day: "numeric" })}–${fmt(last, { day: "numeric" })} ${fmt(last, { month: "long" })}`
      : `${fmt(first, { day: "numeric", month: "long" })} – ${fmt(last, { day: "numeric", month: "long" })}`;
    const days = `${cap(fmt(first, { weekday: "long" }))} a ${fmt(last, { weekday: "long" })}`;
    sections.push({ key: "week", label: `${range} · ${days}`, nested: true, items: week });
  }
  for (const [key, group] of later) {
    const date = new Date(group[0].at);
    const diff = dayDiff(date, now, timeZone);
    const dm = fmt(date, { day: "numeric", month: "long" });
    sections.push({
      key: `later-${key}`,
      label: diff === 7 ? `Próximo ${fmt(date, { weekday: "long" })} · ${dm}` : `${cap(fmt(date, { weekday: "long" }))}, ${dm}`,
      nested: true,
      items: group,
    });
  }
  return sections;
}

/** Rótulo do horário numa linha: só a hora no próprio dia; senão o dia da semana (e a data, de uma semana em diante). */
export function rowTimeLabel(iso: string, now: Date, timeZone: string, locale = "pt-BR"): string {
  const date = new Date(iso);
  const diff = dayDiff(date, now, timeZone);
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  if (diff <= 1) return time;
  const weekday = weekdayName(date, timeZone, locale);
  if (diff < 7) return `${weekday} · ${time}`;
  const dm = new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" }).format(date).replace(".", "").replace(" de ", " ");
  return `${dm} · ${weekday} · ${time}`;
}
