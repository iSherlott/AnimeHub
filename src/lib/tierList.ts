import { prisma } from "@/lib/prisma";
import { seasonDisplayName, type SeasonName, type SeasonRef } from "@/lib/exploreGroups";
import { extractHashtags, MAX_HASHTAGS_PER_POST } from "@/lib/hashtags";
import { linkHashtagsToPost } from "@/lib/postHashtags";
import { TIERS, type Tier, type TierWork } from "@/lib/tierListTypes";

/**
 * Tier list da temporada (10/11/2026): a pessoa distribui as obras da temporada que acompanha em S/A/B/C/D e pode
 * publicar no Feed (uma publicação de texto, com a # #tierlist). Uma por pessoa e temporada.
 */
export { TIERS, type Tier, type TierWork };

/** Só obras da temporada da pessoa, sem repetir e sem tier inventado. */
export function sanitizeTiers(raw: unknown, allowed: Set<string>): Record<Tier, string[]> {
  const out = Object.fromEntries(TIERS.map((t) => [t, [] as string[]])) as Record<Tier, string[]>;
  if (!raw || typeof raw !== "object") return out;
  const seen = new Set<string>();
  for (const tier of TIERS) {
    const list = (raw as Record<string, unknown>)[tier];
    if (!Array.isArray(list)) continue;
    for (const key of list) {
      if (typeof key !== "string" || !allowed.has(key) || seen.has(key)) continue;
      seen.add(key);
      out[tier].push(key);
    }
  }
  return out;
}

/** O texto da publicação: uma linha por tier com obras. */
export function tierListPostBody(season: SeasonRef, tiers: Record<Tier, string[]>, titleOf: (key: string) => string): string {
  const lines = TIERS.filter((t) => tiers[t].length > 0).map((t) => `${t}: ${tiers[t].map(titleOf).join(", ")}`);
  return [`Minha tier list de ${seasonDisplayName(season)}`, "", ...lines, "", "#tierlist"].join("\n");
}

export async function seasonWorksFor(userId: string, season: SeasonRef): Promise<TierWork[]> {
  const rows = await prisma.anime.findMany({
    where: { userId, season: season.season, seasonYear: season.year },
    orderBy: { titleRomaji: "asc" },
    select: { id: true, anilistId: true, anidbId: true, titleRomaji: true, titleEnglish: true, coverImage: true },
  });
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const key = r.anilistId !== null ? String(r.anilistId) : r.anidbId !== null ? `anidb-${r.anidbId}` : r.id;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ key, titleRomaji: r.titleRomaji, titleEnglish: r.titleEnglish, coverImage: r.coverImage }];
  });
}

export async function loadTierList(userId: string, season: SeasonRef): Promise<{ works: TierWork[]; tiers: Record<Tier, string[]>; postId: string | null }> {
  const [works, saved] = await Promise.all([
    seasonWorksFor(userId, season),
    prisma.tierList.findUnique({ where: { userId_season_seasonYear: { userId, season: season.season, seasonYear: season.year } } }),
  ]);
  let parsed: unknown = null;
  try {
    parsed = saved ? JSON.parse(saved.tiersJson) : null;
  } catch {
    parsed = null;
  }
  return { works, tiers: sanitizeTiers(parsed, new Set(works.map((w) => w.key))), postId: saved?.postId ?? null };
}

export async function saveTierList(userId: string, season: SeasonRef, raw: unknown): Promise<Record<Tier, string[]>> {
  const works = await seasonWorksFor(userId, season);
  const tiers = sanitizeTiers(raw, new Set(works.map((w) => w.key)));
  await prisma.tierList.upsert({
    where: { userId_season_seasonYear: { userId, season: season.season, seasonYear: season.year } },
    create: { userId, season: season.season, seasonYear: season.year, tiersJson: JSON.stringify(tiers) },
    update: { tiersJson: JSON.stringify(tiers) },
  });
  return tiers;
}

/** Publica (ou republica) a tier list no Feed, como publicação da própria pessoa. */
export async function publishTierList(userId: string, season: SeasonRef): Promise<{ ok: true; postId: string } | { ok: false; status: 400; error: string }> {
  const { works, tiers } = await loadTierList(userId, season);
  if (TIERS.every((t) => tiers[t].length === 0)) return { ok: false, status: 400, error: "Coloque pelo menos uma obra num tier antes de publicar." };
  const titles = new Map(works.map((w) => [w.key, w.titleRomaji]));
  const body = tierListPostBody(season, tiers, (k) => titles.get(k) ?? k);
  const post = await prisma.post.create({ data: { userId, body } });
  await linkHashtagsToPost(post.id, extractHashtags(body).slice(0, MAX_HASHTAGS_PER_POST));
  await prisma.tierList.update({ where: { userId_season_seasonYear: { userId, season: season.season, seasonYear: season.year } }, data: { postId: post.id } });
  return { ok: true, postId: post.id };
}

export function parseSeasonInput(season: unknown, year: unknown): SeasonRef | null {
  const s = typeof season === "string" && ["WINTER", "SPRING", "SUMMER", "FALL"].includes(season) ? (season as SeasonName) : null;
  const y = Number(year);
  return s && Number.isInteger(y) && y >= 1960 && y <= 2100 ? { season: s, year: y } : null;
}
