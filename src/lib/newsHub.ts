import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractHashtags, MAX_HASHTAGS_PER_POST, MAX_HASHTAG_LENGTH } from "@/lib/hashtags";
import { linkHashtagsToPost } from "@/lib/postHashtags";
import { animeSlug } from "@/lib/animeHashtag";

/** Mesmo limite de createPost.ts (não importado de lá: o serviço de notícias roda fora do Next). */
const MAX_POST_BODY_LENGTH = 500;

/**
 * NewsHub: o perfil da plataforma que publica as notícias das obras da
 * temporada. Cada notícia vira uma publicação comum (mesmo cartão, curtida,
 * comentário, repost, denúncia e hashtag) — só muda o autor. A conta não tem
 * senha utilizável: ninguém entra nela, só o serviço de notícias publica.
 */
export const NEWSHUB_HANDLE = "newshub";
export const NEWSHUB_EMAIL = "newshub@system.invalid";
const NEWSHUB_NAME = "NewsHub";
const NEWSHUB_BIO = "Notícias da plataforma sobre as obras da temporada. Cada notícia traz a # da obra e o link da fonte.";
/** Só vira publicação o que saiu nos últimos dias — o histórico antigo não inunda o feed. */
const PUBLISH_WINDOW_DAYS = 30;

export async function ensureNewsHub(): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: NEWSHUB_EMAIL } });
  if (existing) return existing;
  const handleTaken = await prisma.user.findUnique({ where: { handle: NEWSHUB_HANDLE }, select: { id: true } });
  return prisma.user.create({
    data: {
      email: NEWSHUB_EMAIL,
      // Hash que nenhuma senha produz (verifyPassword compara 64 bytes): a conta não faz login.
      passwordHash: "!",
      passwordSalt: "!",
      displayName: NEWSHUB_NAME,
      handle: handleTaken ? null : NEWSHUB_HANDLE,
      bio: NEWSHUB_BIO,
      notifyReleases: false,
      notifyReplies: false,
      notifyComments: false,
      notifyFollowers: false,
      notifyLikes: false,
    },
  });
}

/** A # que identifica a obra: título (inglês se couber, senão romaji) em minúsculas sem símbolos, no limite de uma hashtag. */
export function animeHashtagFor(titles: { titleRomaji: string; titleEnglish?: string | null }): string | null {
  const candidates = [titles.titleEnglish, titles.titleRomaji].filter((t): t is string => Boolean(t)).map(animeSlug).filter((s) => s.length > 0);
  const fits = candidates.find((s) => s.length <= MAX_HASHTAG_LENGTH);
  const chosen = fits ?? candidates[0]?.slice(0, MAX_HASHTAG_LENGTH);
  return chosen ? `#${chosen}` : null;
}

export type NewsPostInput = {
  title: string;
  excerpt: string | null;
  url: string;
  source: string;
  /** Até 5 (limite de hashtags por publicação), a obra principal primeiro. */
  hashtags: string[];
};

/** Corpo da publicação (≤ 500 caracteres): título, trecho, fonte com link e, numa linha própria, as # das obras. */
export function buildNewsPostBody(input: NewsPostInput): string {
  const tags = Array.from(new Set(input.hashtags)).slice(0, MAX_HASHTAGS_PER_POST).join(" ");
  const source = `Fonte: ${input.source} — ${input.url}`;
  const fixed = [input.title, source, tags].filter(Boolean);
  // Reserva o que é fixo (+ separadores) e dá o resto ao trecho.
  const overhead = fixed.join("\n\n").length + (input.excerpt ? 2 : 0);
  const room = MAX_POST_BODY_LENGTH - overhead;
  let excerpt = "";
  if (input.excerpt && room > 40) {
    const flat = input.excerpt.replace(/\s+/g, " ").trim();
    excerpt = flat.length <= room ? flat : `${flat.slice(0, room - 1).replace(/\s+\S*$/, "")}…`;
  }
  const parts = [input.title, excerpt, source, tags].filter(Boolean);
  const body = parts.join("\n\n");
  // Título gigante + URL longa: o título cede (a fonte e as # são o que não pode faltar).
  if (body.length <= MAX_POST_BODY_LENGTH) return body;
  const titleRoom = MAX_POST_BODY_LENGTH - (source.length + tags.length + 4);
  return [`${input.title.slice(0, Math.max(20, titleRoom - 1))}…`, source, tags].filter(Boolean).join("\n\n");
}

type Unpublished = {
  id: string;
  anilistId: number;
  url: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  source: string;
  publishedAt: Date;
};

/** Agrupa as notícias pendentes por link: a mesma matéria citando várias obras vira UMA publicação com várias #. */
export function groupByUrl(rows: Unpublished[]): Unpublished[][] {
  const byUrl = new Map<string, Unpublished[]>();
  for (const row of rows) byUrl.set(row.url, [...(byUrl.get(row.url) ?? []), row]);
  return Array.from(byUrl.values());
}

/**
 * Publica no feed (como NewsHub) as notícias que ainda não viraram publicação.
 * Idempotente: `AnimeNews.postId` marca o que já foi publicado.
 */
export async function publishNewsPosts(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - PUBLISH_WINDOW_DAYS * 86400_000);
  const pending = await prisma.animeNews.findMany({ where: { postId: null, publishedAt: { gte: since } }, orderBy: { publishedAt: "asc" } });
  if (pending.length === 0) return 0;

  const hub = await ensureNewsHub();
  const ids = Array.from(new Set(pending.map((p) => p.anilistId)));
  const catalog = await prisma.catalogEntry.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true } });
  const animeById = new Map(catalog.map((c) => [c.anilistId as number, c]));

  let published = 0;
  for (const group of groupByUrl(pending)) {
    const first = group[0];
    const animes = group.map((g) => animeById.get(g.anilistId)).filter((a): a is NonNullable<typeof a> => Boolean(a));
    const primary = animes[0];
    if (!primary) continue; // obra fora do catálogo: sem # confiável, não publica
    const tags = animes.map((a) => animeHashtagFor(a)).filter((t): t is string => Boolean(t));
    if (tags.length === 0) continue;

    const body = buildNewsPostBody({ title: first.title, excerpt: first.excerpt, url: first.url, source: first.source, hashtags: tags });
    const post = await prisma.post.create({
      data: {
        userId: hub.id,
        anilistId: primary.anilistId,
        animeTitleRomaji: primary.titleRomaji,
        animeTitleEnglish: primary.titleEnglish,
        animeCoverImage: primary.coverImage,
        body,
        imageUrls: first.imageUrl && /^https:\/\//i.test(first.imageUrl) ? [first.imageUrl] : [],
        // A hora da publicação é a da notícia: o feed fica em ordem cronológica de verdade.
        createdAt: first.publishedAt > now ? now : first.publishedAt,
      },
    });
    await linkHashtagsToPost(post.id, extractHashtags(body).slice(0, MAX_HASHTAGS_PER_POST), animes.flatMap((a) => [a.titleRomaji, a.titleEnglish]));
    await prisma.animeNews.updateMany({ where: { id: { in: group.map((g) => g.id) } }, data: { postId: post.id } });
    published += 1;
  }
  return published;
}
