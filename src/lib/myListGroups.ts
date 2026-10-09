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
