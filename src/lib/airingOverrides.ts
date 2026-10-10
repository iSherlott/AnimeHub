import { prisma } from "@/lib/prisma";

/**
 * Overrides de horário (Admin → Overrides, Figma `8:4471`): um valor manual
 * com prioridade sobre o horário da fonte. Só vale para um episódio específico
 * e nunca apaga o valor original — remover o override restaura a origem.
 */
export function overrideKey(anilistId: number, episode: number): string {
  return `${anilistId}-${episode}`;
}

/** Overrides ativos (não removidos) dos animes dados, mais recente primeiro por episódio. */
export async function loadActiveOverrides(anilistIds: number[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (anilistIds.length === 0) return map;
  const rows = await prisma.catalogOverride.findMany({
    where: { anilistId: { in: anilistIds }, field: "airingAt", removedAt: null },
    orderBy: { createdAt: "desc" },
    select: { anilistId: true, episode: true, value: true },
  });
  for (const row of rows) {
    const key = overrideKey(row.anilistId, row.episode);
    if (!map.has(key)) map.set(key, row.value);
  }
  return map;
}

/** Aplica o horário efetivo; entradas sem override passam intactas. */
export function applyAiringOverrides<T extends { anilistId: number; episode: number; airingAt: Date }>(entries: T[], overrides: Map<string, Date>): T[] {
  if (overrides.size === 0) return entries;
  return entries.map((entry) => {
    const value = overrides.get(overrideKey(entry.anilistId, entry.episode));
    return value ? { ...entry, airingAt: value } : entry;
  });
}
