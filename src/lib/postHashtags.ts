import { prisma } from "@/lib/prisma";
import { classifyHashtag, extractHashtags, type ExtractedHashtag } from "@/lib/hashtags";

/** Slug de obra comparável a uma hashtag: só letras/números minúsculos (Unicode). */
export function workKeyFromTitle(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Registra as hashtags do texto numa publicação (ID canônico, sem duplicar
 * por caixa). O tipo "obra" só vale quando o post JÁ tem contexto de obra
 * escolhido explicitamente e a hashtag bate com o nome dela — a hashtag em si
 * nunca cria a associação.
 */
export async function linkHashtagsToPost(
  postId: string,
  tags: ExtractedHashtag[],
  workTitles: Array<string | null | undefined> = []
): Promise<void> {
  if (tags.length === 0) return;
  const workKeys = new Set(workTitles.filter((t): t is string => Boolean(t)).map(workKeyFromTitle));
  for (const tag of tags) {
    const hashtag = await prisma.hashtag.upsert({
      where: { key: tag.key },
      create: { key: tag.key, display: tag.display, kind: classifyHashtag(tag.key, { workKeys }) },
      update: {},
    });
    await prisma.postHashtag.upsert({
      where: { postId_hashtagId: { postId, hashtagId: hashtag.id } },
      create: { postId, hashtagId: hashtag.id },
      update: {},
    });
  }
}

export { extractHashtags };
