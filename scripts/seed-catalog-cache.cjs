/**
 * Popula o cache de "Descobrir" (tabela CatalogEntry) via Kitsu — usado como
 * carga inicial e como reforço manual sempre que a AniList estiver fora do
 * ar por muito tempo. Rode com: npm run seed:catalog
 */
const path = require("node:path");
const { PrismaClient } = require(
  path.join(__dirname, "..", "node_modules", "@prisma", "client")
);

const KITSU_BASE = process.env.KITSU_API_BASE_URL || "https://kitsu.io/api/edge";

// Sem datasourceUrl explícita — a Prisma Client já lê ANIME_HUB_DATABASE_URL
// do .env na raiz do projeto sozinha, igual o resto do app.
const prisma = new PrismaClient();

const FAVORITE_TITLES = [
  "The 100 Girlfriends Who Really Really Really Really Really Love You",
  "Kaiju No. 8",
  "From Overshadowed to Overpowered: Second Reincarnation of a Talentless Sage",
  "Re:Zero − Starting Life in Another World",
  "Kaiju Girl Caramelise",
  "Jujutsu Kaisen",
];

// A Kitsu usa um vocabulário de status diferente da AniList
// (CURRENT/UPCOMING/TBA vs RELEASING/NOT_YET_RELEASED) — normalizamos pro
// vocabulário da AniList aqui, senão o filtro de "Status" no Descobrir fica
// inconsistente dependendo de qual fonte alimentou aquele anime no cache.
function normalizeStatus(kitsuStatus) {
  if (!kitsuStatus) return null;
  const s = kitsuStatus.toUpperCase();
  if (s === "CURRENT") return "RELEASING";
  if (s === "UPCOMING" || s === "TBA") return "NOT_YET_RELEASED";
  return s;
}

function seasonFromDate(dateStr) {
  if (!dateStr) return { season: null, seasonYear: null };
  const d = new Date(dateStr);
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  if (month <= 3) return { season: "WINTER", seasonYear: year };
  if (month <= 6) return { season: "SPRING", seasonYear: year };
  if (month <= 9) return { season: "SUMMER", seasonYear: year };
  return { season: "FALL", seasonYear: year };
}

async function kitsuFetch(urlPath) {
  const res = await fetch(`${KITSU_BASE}${urlPath}`, {
    headers: { Accept: "application/vnd.api+json" },
  });
  if (!res.ok) throw new Error(`Kitsu ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchGenres(kitsuId) {
  try {
    const json = await kitsuFetch(`/anime/${kitsuId}/categories?page[limit]=20`);
    return (json.data ?? []).map((e) => e.attributes?.title).filter(Boolean);
  } catch (err) {
    console.warn("  falhou categorias:", kitsuId, err.message);
    return [];
  }
}

async function mapEntry(entry, popularityRank) {
  const attrs = entry.attributes;
  const titles = attrs.titles || {};
  const poster = attrs.posterImage || {};
  const cover = attrs.coverImage || {};
  const { season, seasonYear } = seasonFromDate(attrs.startDate);
  const genres = await fetchGenres(entry.id);

  return {
    kitsuId: Number(entry.id),
    titleRomaji: attrs.canonicalTitle,
    titleEnglish: titles.en || null,
    titleNative: titles.ja_jp || null,
    coverImage: poster.large || poster.medium || poster.original || null,
    bannerImage: cover.large || cover.original || null,
    description: attrs.synopsis || null,
    episodes: attrs.episodeCount || null,
    status: normalizeStatus(attrs.status),
    season,
    seasonYear,
    genres: genres.join(","),
    startDate: attrs.startDate ? new Date(attrs.startDate) : null,
    endDate: attrs.endDate ? new Date(attrs.endDate) : null,
    // Kitsu não expõe previsão de próximo episódio como a AniList
    // (nextAiringEpisode); esses campos ficam nulos até a AniList
    // conseguir preencher via /api/anilist/season ou /search.
    nextEpisodeNumber: null,
    nextEpisodeAt: null,
    // Posição no /trending/anime da Kitsu — alimenta a fileira "Em alta".
    // Favoritos (não vêm de trending) ficam sem rank.
    popularityRank: popularityRank ?? null,
    source: "kitsu",
  };
}

async function upsert(data) {
  await prisma.catalogEntry.upsert({
    where: { kitsuId: data.kitsuId },
    create: data,
    update: data,
  });
}

(async () => {
  console.log("Buscando favoritos na Kitsu...");
  for (const title of FAVORITE_TITLES) {
    try {
      const json = await kitsuFetch(
        `/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1`
      );
      const entry = json.data?.[0];
      if (!entry) {
        console.warn("  não encontrado:", title);
        continue;
      }
      await upsert(await mapEntry(entry));
      console.log("  ok:", title);
    } catch (err) {
      console.warn("  falhou:", title, err.message);
    }
  }

  console.log("Buscando trending da temporada na Kitsu...");
  try {
    const trending = await kitsuFetch(`/trending/anime`);
    const list = trending.data ?? [];
    for (let i = 0; i < list.length; i++) {
      await upsert(await mapEntry(list[i], i + 1));
    }
    console.log(`  ok: ${list.length} animes em trending`);
  } catch (err) {
    console.warn("  falhou trending:", err.message);
  }

  const count = await prisma.catalogEntry.count();
  console.log(`Cache de descoberta pronto: ${count} animes salvos.`);
  await prisma.$disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
