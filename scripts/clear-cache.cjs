/**
 * Limpa as tabelas de cache (CatalogEntry, Episode, AiringScheduleEntry) e
 * zera os campos de enriquecimento do seu catálogo pessoal (capa, banner,
 * título nativo/inglês, sinopse, gêneros, IDs de outras fontes) — mantém
 * intactos: título romaji, progresso de assistir, links de plataforma,
 * agrupamento de temporada e o ID da AniDB que você já vinculou.
 *
 * Usado pro teste "só AniDB alimenta o app" — assim dá pra ver exatamente
 * o que ela sozinha consegue preencher de novo.
 *
 * Rode com: node scripts/clear-cache.cjs
 */
const path = require("node:path");
const { PrismaClient } = require(
  path.join(__dirname, "..", "node_modules", "@prisma", "client")
);

const DB_PATH = path.join(__dirname, "..", "prisma", "dev.db");
const DB_URL = `file:${DB_PATH.replace(/\\/g, "/")}`;
const prisma = new PrismaClient({ datasourceUrl: DB_URL });

(async () => {
  const catalogCount = await prisma.catalogEntry.count();
  const episodeCount = await prisma.episode.count();
  const airingCount = await prisma.airingScheduleEntry.count();

  await prisma.catalogEntry.deleteMany();
  await prisma.episode.deleteMany();
  await prisma.airingScheduleEntry.deleteMany();

  const animeUpdate = await prisma.anime.updateMany({
    data: {
      kitsuId: null,
      malId: null,
      shikimoriId: null,
      titleEnglish: null,
      titleNative: null,
      titleFurigana: null,
      coverImage: null,
      bannerImage: null,
      description: null,
      format: null,
      status: null,
      season: null,
      seasonYear: null,
      genres: null,
    },
  });

  console.log(`Cache limpo:`);
  console.log(`  CatalogEntry removidas: ${catalogCount}`);
  console.log(`  Episode removidos: ${episodeCount}`);
  console.log(`  AiringScheduleEntry removidas: ${airingCount}`);
  console.log(`  Anime com enriquecimento zerado: ${animeUpdate.count}`);
  console.log(`Mantidos: titleRomaji, progresso, links de plataforma, anidbId, agrupamento de temporada.`);

  await prisma.$disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
