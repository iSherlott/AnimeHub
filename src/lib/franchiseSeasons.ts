import { prisma } from "@/lib/prisma";
import { deriveSeriesInfo } from "@/lib/series";

/**
 * As temporadas de uma obra reunidas num só lugar: a franquia (relações da AniList) e, para as que a AniList não liga
 * (ou que só vieram do AniDB), o mesmo título-base com número de temporada diferente ("… 2nd Season", "Season 2", "II").
 * As temporadas da franquia entram todas (cada uma tem a própria página); as ligadas só pelo título entram se estiverem na plataforma.
 */
export type SeasonEntry = {
  anilistId: number;
  seasonNumber: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  description: string | null;
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  /** Sinopse já traduzida guardada no catálogo (português e japonês). */
  stored?: { pt: string | null; ja: string | null };
  current: boolean;
};

/** O número da produção vem das relações da AniList; quando elas não ligam a sequência (fica 1), vale o do título ("2nd Season"). */
function seasonNumberOf(stored: number, titleRomaji: string): number {
  return Math.max(stored, deriveSeriesInfo(titleRomaji).seasonNumber);
}

export async function loadFranchiseSeasons(anilistId: number): Promise<SeasonEntry[]> {
  const production = await prisma.production.findUnique({ where: { anilistId } });
  const base = production ?? (await prisma.catalogEntry.findUnique({ where: { anilistId } }));
  if (!base) return [];
  const info = deriveSeriesInfo(base.titleRomaji);
  const entries = new Map<number, SeasonEntry>();

  const add = (e: Omit<SeasonEntry, "current">) => {
    if (!entries.has(e.anilistId)) entries.set(e.anilistId, { ...e, current: e.anilistId === anilistId });
  };

  if (production) {
    const siblings = await prisma.production.findMany({ where: { franchiseId: production.franchiseId } });
    for (const s of siblings) {
      add({ anilistId: s.anilistId, seasonNumber: seasonNumberOf(s.seasonNumber, s.titleRomaji), titleRomaji: s.titleRomaji, titleEnglish: s.titleEnglish, titleNative: s.titleNative, coverImage: s.coverImage, description: s.description, format: s.format, status: s.status, season: s.season, seasonYear: s.seasonYear, episodes: s.episodes });
    }
  }

  // Mesmo título-base, outro número de temporada: cobre o que a AniList não liga por relação.
  const catalog = await prisma.catalogEntry.findMany({
    where: { anilistId: { not: null }, onPlatform: true, titleRomaji: { contains: info.seriesKey, mode: "insensitive" } },
  });
  for (const c of catalog) {
    const id = c.anilistId as number;
    const derived = deriveSeriesInfo(c.titleRomaji);
    if (id !== anilistId && derived.seriesKey !== info.seriesKey) continue;
    add({ anilistId: id, seasonNumber: derived.seasonNumber, titleRomaji: c.titleRomaji, titleEnglish: c.titleEnglish, titleNative: c.titleNative, coverImage: c.coverImage, description: c.description, format: null, status: c.status, season: c.season, seasonYear: c.seasonYear, episodes: c.episodes });
  }
  // A própria obra sempre está na lista (mesmo sem produção ou catálogo completo).
  add({ anilistId, seasonNumber: "seasonNumber" in base ? seasonNumberOf(base.seasonNumber, base.titleRomaji) : info.seasonNumber, titleRomaji: base.titleRomaji, titleEnglish: base.titleEnglish, titleNative: base.titleNative, coverImage: base.coverImage, description: base.description, format: "format" in base ? base.format : null, status: base.status, season: base.season, seasonYear: base.seasonYear, episodes: base.episodes });

  // "Temporadas" é a linha principal: OVA, ODA e filmes (já classificados pela curadoria) ficam em "Especiais e filmes".
  const meta = await prisma.catalogEntry.findMany({ where: { anilistId: { in: Array.from(entries.keys()) } }, select: { anilistId: true, kind: true, descriptionPt: true, descriptionJa: true } });
  for (const m of meta) {
    const id = m.anilistId as number;
    if (m.kind && m.kind !== "EPISODE" && id !== anilistId) {
      entries.delete(id);
      continue;
    }
    const entry = entries.get(id);
    if (entry && (m.descriptionPt || m.descriptionJa)) entry.stored = { pt: m.descriptionPt, ja: m.descriptionJa };
  }

  return Array.from(entries.values()).sort((a, b) => a.seasonNumber - b.seasonNumber || (a.seasonYear ?? 0) - (b.seasonYear ?? 0));
}
