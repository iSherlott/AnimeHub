import { XMLParser } from "fast-xml-parser";
import { htmlToPlainText } from "@/lib/plainText";
import { normalizeTitle } from "@/lib/adminImport/matching";

/**
 * Segunda fonte de notícias: o feed RSS público do Anime News Network (feed
 * oficial, feito para ser lido por outros sites — não é coleta de página). O
 * feed é geral; cada item só vira notícia de uma obra quando cita o título dela.
 */
export const NEWS_FEED_URL = process.env.NEWS_FEED_URL ?? "https://www.animenewsnetwork.com/all/rss.xml";
export const NEWS_FEED_SOURCE = "Anime News Network";

export type FeedItem = { url: string; title: string; excerpt: string | null; publishedAt: Date; category: string | null };

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true });

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

/** Itens do RSS 2.0 (só https; título, link e data válidos). */
export function parseNewsFeed(xml: string): FeedItem[] {
  let raw: unknown;
  try {
    raw = parser.parse(xml)?.rss?.channel?.item;
  } catch {
    return [];
  }
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const items: FeedItem[] = [];
  for (const entry of list as Array<Record<string, unknown>>) {
    const url = text(entry.link).trim();
    const title = htmlToPlainText(text(entry.title)).slice(0, 300);
    const publishedAt = new Date(text(entry.pubDate));
    if (!/^https:\/\//i.test(url) || !title || Number.isNaN(publishedAt.getTime())) continue;
    items.push({ url, title, excerpt: htmlToPlainText(text(entry.description)).slice(0, 400) || null, publishedAt, category: text(entry.category) || null });
  }
  return items;
}

/** "Foo 2nd Season", "Foo Season 3", "Foo Part 2", "Foo (2026)": a notícia fala da obra, não da temporada. */
export function baseTitle(title: string): string {
  return normalizeTitle(title)
    .replace(/\b(\d+(st|nd|rd|th) season|season \d+|part \d+|\d+(st|nd|rd|th) cour|2 cour|tv|\d{4}|[ivx]{1,4}|\d+)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type SeasonAnime = { anilistId: number; titles: string[] };

/** Títulos que identificam a obra com segurança: ≥ 8 letras (evita "Ao no Hako" casar em qualquer frase). */
function needles(titles: string[]): string[] {
  const out = new Set<string>();
  for (const t of titles) {
    for (const n of [normalizeTitle(t), baseTitle(t)]) if (n.length >= 8) out.add(n);
  }
  return Array.from(out);
}

/** anilistId → itens do feed que citam a obra (título ou sinopse do item). */
export function matchFeedToAnimes(items: FeedItem[], animes: SeasonAnime[]): Map<number, FeedItem[]> {
  const prepared = animes.map((a) => ({ id: a.anilistId, needles: needles(a.titles).map((n) => ` ${n} `) })).filter((a) => a.needles.length > 0);
  const result = new Map<number, FeedItem[]>();
  for (const item of items) {
    const haystack = ` ${normalizeTitle(`${item.title} ${item.excerpt ?? ""}`)} `;
    for (const anime of prepared) {
      if (anime.needles.some((n) => haystack.includes(n))) {
        const list = result.get(anime.id) ?? [];
        list.push(item);
        result.set(anime.id, list);
      }
    }
  }
  return result;
}

export async function fetchNewsFeed(fetcher: typeof fetch = fetch): Promise<FeedItem[]> {
  const res = await fetcher(NEWS_FEED_URL, { headers: { "User-Agent": "AnimeHub/1.0 (feed reader)", Accept: "application/rss+xml, application/xml" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Feed de notícias respondeu ${res.status}`);
  return parseNewsFeed(await res.text());
}
