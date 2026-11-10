import { prisma } from "@/lib/prisma";
import { anilistRequest } from "@/lib/anilist";

/**
 * Personagens e dubladores (10/11/2026), da AniList, quando o admin carrega o elenco de uma temporada: os personagens
 * principais e de apoio de cada obra, com o dublador japonês. Viram páginas (/personagem/<id>, /dublador/<id>) e a
 * pessoa pode ter até `MAX_FAVORITES` personagens favoritos no perfil.
 */
export const MAX_FAVORITES = 5;
const GAP_MS = Number(process.env.ANILIST_CAST_GAP_MS ?? 1200);

const CAST_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      characters(sort: [ROLE, RELEVANCE, ID], perPage: 25) {
        edges {
          role
          node { id name { full native } image { large } }
          voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { id name { full native } image { large } }
        }
      }
    }
  }
`;

type RawCast = {
  Media: {
    characters: {
      edges: { role: string; node: { id: number; name: { full: string | null; native: string | null }; image: { large: string | null } | null } | null; voiceActors: { id: number; name: { full: string | null; native: string | null }; image: { large: string | null } | null }[] }[];
    };
  } | null;
};

export type CastEntry = { role: string; character: { id: number; name: string; nativeName: string | null; image: string | null }; voiceActor: { id: number; name: string; nativeName: string | null; image: string | null } | null };

export function parseCast(raw: RawCast): CastEntry[] {
  const edges = raw.Media?.characters?.edges ?? [];
  return edges.flatMap((e) => {
    if (!e.node || !e.node.name.full) return [];
    const va = e.voiceActors?.find((v) => v.name.full);
    return [
      {
        role: e.role === "MAIN" ? "MAIN" : e.role === "SUPPORTING" ? "SUPPORTING" : "BACKGROUND",
        character: { id: e.node.id, name: e.node.name.full, nativeName: e.node.name.native, image: e.node.image?.large ?? null },
        voiceActor: va ? { id: va.id, name: va.name.full as string, nativeName: va.name.native, image: va.image?.large ?? null } : null,
      },
    ];
  }).filter((c) => c.role !== "BACKGROUND");
}

/** Grava o elenco de uma obra (substitui o anterior dela). */
export async function saveCast(anilistId: number, cast: CastEntry[]): Promise<void> {
  for (const entry of cast) {
    await prisma.character.upsert({ where: { id: entry.character.id }, create: { ...entry.character }, update: { ...entry.character, fetchedAt: new Date() } });
    if (entry.voiceActor) await prisma.voiceActor.upsert({ where: { id: entry.voiceActor.id }, create: { ...entry.voiceActor }, update: { ...entry.voiceActor, fetchedAt: new Date() } });
  }
  await prisma.$transaction([
    prisma.workCharacter.deleteMany({ where: { anilistId, characterId: { notIn: cast.map((c) => c.character.id) } } }),
    ...cast.map((c, position) =>
      prisma.workCharacter.upsert({
        where: { anilistId_characterId: { anilistId, characterId: c.character.id } },
        create: { anilistId, characterId: c.character.id, role: c.role, voiceActorId: c.voiceActor?.id ?? null, position },
        update: { role: c.role, voiceActorId: c.voiceActor?.id ?? null, position },
      })
    ),
  ]);
}

/** Carrega o elenco de várias obras da AniList (uma por vez, com pausa, para respeitar o limite deles). */
export async function loadCast(anilistIds: number[]): Promise<{ works: number; characters: number; failed: number }> {
  let works = 0;
  let characters = 0;
  let failed = 0;
  for (const [i, id] of anilistIds.entries()) {
    try {
      const cast = parseCast(await anilistRequest<RawCast>(CAST_QUERY, { id }, { fresh: true }));
      await saveCast(id, cast);
      if (cast.length) works += 1;
      characters += cast.length;
    } catch (error) {
      failed += 1;
      console.error(`[workCast] obra ${id} falhou:`, error);
    }
    if (i < anilistIds.length - 1 && GAP_MS > 0) await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return { works, characters, failed };
}

import type { CastView } from "@/lib/workCastTypes";
export type { CastView };

export async function castFor(anilistId: number): Promise<CastView[]> {
  const rows = await prisma.workCharacter.findMany({ where: { anilistId }, orderBy: { position: "asc" }, include: { character: true, voiceActor: true } });
  return rows.map((r) => ({ characterId: r.characterId, name: r.character.name, nativeName: r.character.nativeName, image: r.character.image, role: r.role, voiceActor: r.voiceActor ? { id: r.voiceActor.id, name: r.voiceActor.name, nativeName: r.voiceActor.nativeName } : null }));
}

/** Favoritar ou desfavoritar um personagem (até `MAX_FAVORITES`). */
export async function toggleFavoriteCharacter(userId: string, characterId: number, favorite: boolean): Promise<{ ok: true; favorites: number[] } | { ok: false; status: 404 | 409; error: string }> {
  if (!(await prisma.character.findUnique({ where: { id: characterId }, select: { id: true } }))) return { ok: false, status: 404, error: "Personagem não encontrado." };
  if (favorite) {
    const current = await prisma.favoriteCharacter.findMany({ where: { userId }, select: { characterId: true } });
    if (!current.some((c) => c.characterId === characterId)) {
      if (current.length >= MAX_FAVORITES) return { ok: false, status: 409, error: `Você já tem ${MAX_FAVORITES} personagens favoritos. Tire um para escolher outro.` };
      await prisma.favoriteCharacter.create({ data: { userId, characterId, position: current.length } });
    }
  } else {
    await prisma.favoriteCharacter.deleteMany({ where: { userId, characterId } });
  }
  return { ok: true, favorites: (await prisma.favoriteCharacter.findMany({ where: { userId }, orderBy: { position: "asc" }, select: { characterId: true } })).map((f) => f.characterId) };
}
