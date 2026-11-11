import { prisma } from "@/lib/prisma";
import { buildNewsPostBody, NEWSHUB_EMAIL } from "@/lib/newsHub";
import { detectNewsLang, translateBetween, TranslationQuotaError, type NewsLang } from "@/lib/translate";

/**
 * Tradução das notícias do Feed (11/11/2026). As notícias chegam em japonês (sites oficiais) ou inglês (Anime News
 * Network); o Feed mostra em português e um botão troca para inglês ou japonês. Só o título e o trecho da matéria passam
 * pelo tradutor — a fonte, o link e as # são remontados iguais em cada idioma.
 *
 * Roda no fim de cada coleta de notícias (o serviço já tem o LibreTranslate do cluster) e traduz cada publicação uma vez.
 */
export const NEWS_LANGS: readonly NewsLang[] = ["pt", "en", "ja"];

type Translate = (text: string, source: NewsLang, target: NewsLang) => Promise<string>;

export type NewsTranslationResult = { translated: number; failed: number; stoppedByQuota: boolean };

export async function translateNewsPosts(options: { limit?: number; deadline?: number; translate?: Translate } = {}): Promise<NewsTranslationResult> {
  const { limit = 80, deadline = Date.now() + 10 * 60 * 1000, translate = (t, s, g) => translateBetween(t, s, g) } = options;
  const result: NewsTranslationResult = { translated: 0, failed: 0, stoppedByQuota: false };
  const hub = await prisma.user.findUnique({ where: { email: NEWSHUB_EMAIL }, select: { id: true } });
  if (!hub) return result;

  // As mais novas primeiro: é o que aparece no topo do Feed.
  const posts = await prisma.post.findMany({
    where: { userId: hub.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, bodyLang: true, translations: { select: { lang: true } } },
  });
  const pending = posts.filter((p) => p.translations.length < NEWS_LANGS.length - 1).slice(0, limit);
  if (pending.length === 0) return result;
  const news = await prisma.animeNews.findMany({ where: { postId: { in: pending.map((p) => p.id) } }, orderBy: { publishedAt: "asc" } });
  const newsByPost = new Map<string, (typeof news)[number]>();
  for (const n of news) if (n.postId && !newsByPost.has(n.postId)) newsByPost.set(n.postId, n);

  for (const post of pending) {
    if (Date.now() > deadline) break;
    const item = newsByPost.get(post.id);
    if (!item) continue;
    const original = (post.bodyLang as NewsLang | null) ?? detectNewsLang(`${item.title} ${item.excerpt ?? ""}`);
    if (!post.bodyLang) await prisma.post.update({ where: { id: post.id }, data: { bodyLang: original } });
    const have = new Set(post.translations.map((t) => t.lang));
    const hashtags = post.body.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    for (const lang of NEWS_LANGS) {
      if (lang === original || have.has(lang)) continue;
      try {
        const title = await translate(item.title, original, lang);
        const excerpt = item.excerpt ? await translate(item.excerpt, original, lang) : null;
        const body = buildNewsPostBody({ title, excerpt, url: item.url, source: item.source, hashtags });
        await prisma.postTranslation.upsert({ where: { postId_lang: { postId: post.id, lang } }, create: { postId: post.id, lang, body }, update: { body } });
        result.translated += 1;
      } catch (error) {
        if (error instanceof TranslationQuotaError) {
          result.stoppedByQuota = true;
          return result;
        }
        console.error(`[news] tradução da publicação ${post.id} para ${lang} falhou:`, error);
        result.failed += 1;
      }
    }
  }
  return result;
}
