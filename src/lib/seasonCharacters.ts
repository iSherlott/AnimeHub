import { prisma } from "@/lib/prisma";
import { extractHashtags, MAX_HASHTAGS_PER_POST } from "@/lib/hashtags";
import { linkHashtagsToPost } from "@/lib/postHashtags";
import { animeHashtagFor, ensureNewsHub, linkTagToAnime } from "@/lib/newsHub";
import { seasonDisplayName, type SeasonRef } from "@/lib/exploreGroups";

/**
 * Personagem da temporada (12/11/2026). O ranking é o dos favoritos (cada pessoa escolhe até 5 personagens, nas páginas
 * deles) entre os personagens das obras da temporada que estão na plataforma. A administração publica o primeiro no Feed,
 * pelo NewsHub, como o anime da semana; publicar de novo troca a publicação anterior.
 */
export type SeasonCharacterRow = { characterId: number; name: string; nativeName: string | null; image: string | null; favorites: number; workKey: string; workTitle: string };

export async function seasonCharacterRanking(season: SeasonRef, take = 20): Promise<SeasonCharacterRow[]> {
  const works = await prisma.catalogEntry.findMany({ where: { season: season.season, seasonYear: season.year, onPlatform: true, anilistId: { not: null } }, select: { anilistId: true, titleRomaji: true } });
  if (works.length === 0) return [];
  const titleById = new Map(works.map((w) => [w.anilistId as number, w.titleRomaji]));
  const roles = await prisma.workCharacter.findMany({ where: { anilistId: { in: [...titleById.keys()] } }, select: { anilistId: true, characterId: true, role: true }, orderBy: { position: "asc" } });
  if (roles.length === 0) return [];
  // Personagem em mais de uma obra da temporada: fica com a primeira em que é principal.
  const workOf = new Map<number, number>();
  for (const r of [...roles].sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN"))) if (!workOf.has(r.characterId)) workOf.set(r.characterId, r.anilistId);
  const counts = await prisma.favoriteCharacter.groupBy({ by: ["characterId"], where: { characterId: { in: [...workOf.keys()] } }, _count: { _all: true } });
  const ranked = counts.filter((c) => c._count._all > 0).sort((a, b) => b._count._all - a._count._all || a.characterId - b.characterId).slice(0, take);
  if (ranked.length === 0) return [];
  const characters = new Map((await prisma.character.findMany({ where: { id: { in: ranked.map((r) => r.characterId) } }, select: { id: true, name: true, nativeName: true, image: true } })).map((c) => [c.id, c]));
  return ranked.flatMap((r) => {
    const c = characters.get(r.characterId);
    const anilistId = workOf.get(r.characterId);
    if (!c || anilistId === undefined) return [];
    return [{ characterId: c.id, name: c.name, nativeName: c.nativeName, image: c.image, favorites: r._count._all, workKey: String(anilistId), workTitle: titleById.get(anilistId) ?? "" }];
  });
}

export function seasonCharacterPostBody(season: SeasonRef, ranking: SeasonCharacterRow[], workTag: string | null): string {
  const [first] = ranking;
  const podium = ranking.slice(0, 3).map((r, i) => `${i + 1}º ${r.name} (${r.workTitle}) — ${r.favorites} ${r.favorites === 1 ? "favorito" : "favoritos"}`);
  return [`🏆 Personagem da temporada · ${seasonDisplayName(season)}: ${first.name}, de ${first.workTitle}!`, "", ...podium, "", `Pelos favoritos de quem tem conta no AnimeHub. #personagemdatemporada${workTag ? ` ${workTag}` : ""}`].join("\n");
}

export async function publishSeasonCharacter(season: SeasonRef, now = new Date()): Promise<{ ok: true; postId: string; characterId: number } | { ok: false; status: 409; error: string }> {
  const ranking = await seasonCharacterRanking(season, 3);
  if (ranking.length === 0) return { ok: false, status: 409, error: "Nenhum personagem desta temporada foi favoritado ainda (o elenco precisa estar carregado)." };
  const [first] = ranking;
  const entry = await prisma.catalogEntry.findUnique({ where: { anilistId: Number(first.workKey) }, select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true } });
  const tag = entry ? animeHashtagFor(entry) : null;
  const body = seasonCharacterPostBody(season, ranking, tag);
  const hub = await ensureNewsHub();
  const previous = await prisma.seasonCharacterAward.findUnique({ where: { season_seasonYear: { season: season.season, seasonYear: season.year } }, select: { postId: true } });
  if (previous?.postId) await prisma.post.updateMany({ where: { id: previous.postId, userId: hub.id }, data: { deletedAt: now } });
  const post = await prisma.post.create({
    data: {
      userId: hub.id,
      anilistId: entry?.anilistId ?? null,
      animeTitleRomaji: entry?.titleRomaji ?? first.workTitle,
      animeTitleEnglish: entry?.titleEnglish ?? null,
      animeCoverImage: entry?.coverImage ?? null,
      body,
      // A imagem do personagem (em pé) cabe no quadro do Feed.
      imageUrls: first.image ? [first.image] : entry?.coverImage ? [entry.coverImage] : [],
      imageAlts: first.image ? [first.name] : entry?.coverImage ? [""] : [],
      imageSpoilers: first.image || entry?.coverImage ? [false] : [],
      createdAt: now,
    },
  });
  await linkHashtagsToPost(post.id, extractHashtags(body).slice(0, MAX_HASHTAGS_PER_POST), [entry?.titleRomaji ?? null, entry?.titleEnglish ?? null]);
  if (tag && entry?.anilistId) await linkTagToAnime(tag.slice(1), entry.anilistId);
  const data = { characterId: first.characterId, workKey: first.workKey, favorites: first.favorites, postId: post.id };
  await prisma.seasonCharacterAward.upsert({ where: { season_seasonYear: { season: season.season, seasonYear: season.year } }, create: { season: season.season, seasonYear: season.year, ...data }, update: data });
  return { ok: true, postId: post.id, characterId: first.characterId };
}
