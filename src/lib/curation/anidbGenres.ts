import { prisma } from "@/lib/prisma";
import { parseSeasonSlug } from "@/lib/exploreGroups";
import { ADULT_MARKER, normalizeGenres } from "@/lib/genreTaxonomy";
import { parseSeasonHtml } from "@/lib/adminImport/parseSeasonHtml";

/**
 * Gêneros que o AniDB atribuiu a cada obra, lidos de novo do HTML de cada carga (guardado no job) com o vocabulário atual.
 * Os gêneros gravados no momento da carga passaram pela lista antiga, que descartava Drama, Josei e Loli; o HTML original
 * continua inteiro no job, então nada se perde. Devolve anidbId → gêneros (vários lotes da mesma obra se juntam).
 */
export async function loadAnidbGenres(): Promise<Map<number, string[]>> {
  const jobs = await prisma.adminJob.findMany({ where: { kind: "IMPORT", html: { not: null } }, orderBy: { seq: "asc" }, select: { season: true, html: true } });
  const byAnidb = new Map<number, string[]>();
  for (const job of jobs) {
    const season = job.season ? parseSeasonSlug(job.season.toLowerCase()) : null;
    let records;
    try {
      records = parseSeasonHtml(job.html as string, { season }).records;
    } catch {
      continue; // um HTML que já não lê não derruba a curadoria
    }
    for (const record of records) {
      const id = Number(record.sourceKey);
      const genres = record.genres.filter((g) => g !== ADULT_MARKER);
      if (!Number.isFinite(id) || record.adult || genres.length === 0) continue;
      byAnidb.set(id, normalizeGenres([...(byAnidb.get(id) ?? []), ...genres]));
    }
  }
  return byAnidb;
}
