import { defaultFetcher, isPrivateHost, robotsAllows, type Fetcher } from "@/lib/officialNews";
import { imageSizes, type ImageDimensions } from "@/lib/imageSize";

/**
 * A imagem de cada notícia do Feed (11/11/2026).
 *
 * Por que faltava: o feed do Anime News Network e a lista de notícias dos sites oficiais não trazem imagem, e a matéria
 * nunca era aberta — então toda notícia caía na capa ou no banner da obra. Agora a matéria é aberta UMA vez (respeitando
 * o robots.txt) só para ler a imagem que ela mesma indica para compartilhamento (`og:image`/`twitter:image`).
 *
 * Nem toda imagem serve para o Feed, que mostra a foto num quadro entre 4:5 (em pé) e 1,91:1 (deitado). Ficam de fora:
 * logotipo, ícone, imagem pequena, faixa larga demais (os banners da AniList, 1900×400, viram uma tira cortada no meio) e
 * formatos que não são foto (svg, gif).
 */
export const FEED_MIN_WIDTH = 400;
export const FEED_MIN_HEIGHT = 220;
/** Mais em pé que 3:5 ou mais deitada que 2,2:1 perde demais no quadro do Feed. */
export const FEED_MIN_RATIO = 0.6;
export const FEED_MAX_RATIO = 2.2;

export function fitsFeed(size: ImageDimensions | undefined | null): boolean {
  if (!size || size.width < FEED_MIN_WIDTH || size.height < FEED_MIN_HEIGHT) return false;
  const ratio = size.width / size.height;
  return ratio >= FEED_MIN_RATIO && ratio <= FEED_MAX_RATIO;
}

/** Nome de arquivo de logotipo, ícone ou imagem "sem foto": nunca é a imagem da notícia. */
const JUNK_RE = /(logo|icon|favicon|sprite|blank|spacer|no[_-]?image|noimg|dummy|placeholder|default[_-]?(ogp?|share|thumb)|apple-touch|1x1)/i;

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#0?38;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** As imagens que a página indica para compartilhamento, na ordem de preferência (só https, sem logotipo/ícone/svg/gif). */
export function articleImageCandidates(html: string, pageUrl: string): string[] {
  const head = html.slice(0, 300_000);
  const found: Array<{ rank: number; url: string }> = [];
  const RANK: Record<string, number> = { "og:image:secure_url": 0, "og:image:url": 1, "og:image": 2, "twitter:image": 3, "twitter:image:src": 3 };
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    if (!(key in RANK)) continue;
    const content = attr(tag, "content");
    if (content) found.push({ rank: RANK[key], url: content });
  }
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, "rel") ?? "").toLowerCase() !== "image_src") continue;
    const href = attr(tag, "href");
    if (href) found.push({ rank: 4, url: href });
  }
  const out: string[] = [];
  for (const { url } of found.sort((a, b) => a.rank - b.rank)) {
    let resolved: URL;
    try {
      resolved = new URL(decodeEntities(url), pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:" || isPrivateHost(resolved.hostname)) continue;
    if (/\.(svg|gif|ico)(\?|$)/i.test(resolved.pathname) || JUNK_RE.test(resolved.pathname)) continue;
    const href = resolved.toString();
    if (!out.includes(href)) out.push(href);
  }
  return out;
}

export type ArticleImageDeps = {
  fetcher?: Fetcher;
  /** robots.txt de cada site, guardado durante a execução. */
  robots?: Map<string, string>;
  /** Mede as imagens (padrão: imageSizes, que guarda a medida no banco). */
  sizeOf?: (urls: string[]) => Promise<Map<string, ImageDimensions>>;
};

const defaultSizeOf = (urls: string[]) => imageSizes(urls, { measureMissing: true });

/** A imagem da matéria que serve para o Feed, ou null (site fora do ar, robots não deixa, nenhuma imagem adequada). */
export async function findArticleImage(articleUrl: string, deps: ArticleImageDeps = {}): Promise<string | null> {
  const fetcher = deps.fetcher ?? defaultFetcher;
  const robots = deps.robots ?? new Map<string, string>();
  let url: URL;
  try {
    url = new URL(articleUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return null;
  if (!robots.has(url.origin)) {
    const res = await fetcher(`${url.origin}/robots.txt`);
    robots.set(url.origin, res && res.status === 200 && !/<html/i.test(res.body.slice(0, 500)) ? res.body : "");
  }
  if (!robotsAllows(robots.get(url.origin) ?? "", url.pathname)) return null;
  const page = await fetcher(url.toString());
  if (!page || page.status !== 200 || !page.body) return null;
  const candidates = articleImageCandidates(page.body, page.url || url.toString()).slice(0, 3);
  if (candidates.length === 0) return null;
  const sizes = await (deps.sizeOf ?? defaultSizeOf)(candidates);
  return candidates.find((c) => fitsFeed(sizes.get(c))) ?? null;
}

/**
 * A imagem da publicação: a da matéria (já conferida); sem ela, a da obra que servir para o Feed — o banner só se não
 * for uma faixa larga demais, senão a capa. Sem nada que sirva, a capa mesmo assim (toda notícia sai com imagem).
 */
export function pickNewsImage(newsImage: string | null, anime: { coverImage: string | null; bannerImage: string | null }, sizes: Map<string, ImageDimensions>): string | null {
  const https = (u: string | null): u is string => Boolean(u) && /^https:\/\//i.test(u as string);
  if (https(newsImage)) return newsImage;
  const fallbacks = [anime.bannerImage, anime.coverImage].filter(https);
  return fallbacks.find((u) => fitsFeed(sizes.get(u))) ?? (https(anime.coverImage) ? anime.coverImage : (fallbacks[0] ?? null));
}
