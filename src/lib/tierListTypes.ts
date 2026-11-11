/** Os tiers e o tipo de obra da tier list (o navegador também usa). Ver tierList.ts. */
export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIERS)[number];
export type TierWork = { key: string; titleRomaji: string; titleEnglish: string | null; coverImage: string | null };

/** Onde a obra cai no montador: um tier ou "none" (sem tier). */
export type TierZone = Tier | "none";

/** Tira a obra de onde estiver e a põe no tier, antes de `beforeKey` (ou no fim); "none" só tira. */
export function moveWork(current: Record<Tier, string[]>, key: string, zone: TierZone, beforeKey: string | null): Record<Tier, string[]> {
  const next = Object.fromEntries(TIERS.map((t) => [t, current[t].filter((k) => k !== key)])) as Record<Tier, string[]>;
  if (zone === "none") return next;
  const list = next[zone];
  const at = beforeKey ? list.indexOf(beforeKey) : -1;
  next[zone] = at >= 0 ? [...list.slice(0, at), key, ...list.slice(at)] : [...list, key];
  return next;
}

/** A cor de cada tier — a mesma no montador e na publicação. */
export const TIER_COLORS: Record<Tier, string> = { S: "#ff164f", A: "#ff8a3d", B: "#ffd400", C: "#4fc3a1", D: "#6b8cff" };

/** Obra como ficou gravada na publicação (título e capa do momento em que a pessoa publicou). */
export type TierSnapshotWork = { key: string; title: string; cover: string | null };
/** A tier list guardada na publicação (`Post.tierListJson`): o Feed desenha o mesmo quadro do montador. */
export type TierSnapshot = { season: string; seasonYear: number; tiers: Record<Tier, TierSnapshotWork[]> };

/** Lê o JSON da publicação; qualquer coisa fora do formato vira null (a publicação fica só com o texto). */
export function parseTierSnapshot(json: string | null | undefined): TierSnapshot | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { season, seasonYear, tiers } = raw as { season?: unknown; seasonYear?: unknown; tiers?: unknown };
  if (typeof season !== "string" || typeof seasonYear !== "number" || !tiers || typeof tiers !== "object") return null;
  const out = Object.fromEntries(TIERS.map((t) => [t, [] as TierSnapshotWork[]])) as Record<Tier, TierSnapshotWork[]>;
  for (const tier of TIERS) {
    const list = (tiers as Record<string, unknown>)[tier];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const { key, title, cover } = item as { key?: unknown; title?: unknown; cover?: unknown };
      if (typeof key !== "string" || !key) continue;
      out[tier].push({ key, title: typeof title === "string" && title ? title : key, cover: typeof cover === "string" && cover ? cover : null });
    }
  }
  if (TIERS.every((t) => out[t].length === 0)) return null;
  return { season, seasonYear, tiers: out };
}

/** Tira do texto as linhas "S: obra, obra" — com o quadro na publicação, elas só repetiriam o que já aparece nele. */
export function stripTierLines(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^(S|A|B|C|D): \S/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
