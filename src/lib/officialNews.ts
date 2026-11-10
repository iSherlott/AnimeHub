import { XMLParser } from "fast-xml-parser";
import { htmlToPlainText } from "@/lib/plainText";

/**
 * Notícias direto do site oficial de cada obra (o link "Official Site" da AniList).
 *
 * Os sites oficiais de anime japoneses seguem um padrão (pesquisa em 50 sites da temporada de outono de 2026). A página
 * inicial liga para uma lista de notícias (`news/`, `news/index.html`, `news.html`). Na lista, cada item (`<li>`,
 * `<article>`, `<tr>` ou `<dt>`) traz a data (`2026.11.07`, `2026/11/07`, `2026-11-07`) e um link para a matéria dentro
 * do mesmo caminho de notícias. Os sistemas por trás variam:
 *   - WordPress, com o feed das notícias em `news/feed/`;
 *   - o sistema de `news/index00350000.html`;
 *   - o de `news/?article_id=` / `news/?id=`;
 *   - `detail.php?id=`;
 *   - páginas feitas à mão.
 * A forma da lista, porém, é sempre essa.
 *
 * Ordem: o feed (RSS/Atom) quando o site tem um — é o que ele publica para ser lido por outros programas — e, sem feed, a
 * lista de notícias. O `robots.txt` de cada site é respeitado; só se leem a página inicial, o feed e a lista (nunca as
 * matérias), com uma pausa entre um site e outro.
 */
export const OFFICIAL_NEWS_SOURCE = "Site oficial";
export const OFFICIAL_NEWS_USER_AGENT = "AnimeHubNewsBot/1.0 (+noticias das obras da temporada; le so a lista de noticias)";

export type OfficialNewsItem = { url: string; title: string; excerpt: string | null; publishedAt: Date };

/** Uma data do jeito que os sites escrevem: 2026.11.07, 2026/11/7, 2026-11-07, 2026年11月7日 ou "2026 11.07" (ano à parte). */
const DATE_RE = /(20\d{2})\s*(?:[./\-年]|\s)\s*(\d{1,2})\s*[./\-月]\s*(\d{1,2})\s*日?/;
const DATE_RE_ALL = new RegExp(DATE_RE.source, "g");

/** O dia da notícia ao meio-dia no Japão (03:00 UTC): sem hora no site, não cai no dia anterior em nenhum fuso do Brasil. */
export function parseSiteDate(text: string): Date | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, 3));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

function resolve(href: string, base: string): URL | null {
  try {
    const url = new URL(href.replace(/&amp;/g, "&").trim(), base);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function stripNoise(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
}

const plain = (html: string) => htmlToPlainText(html).replace(/\s+/g, " ").trim();

/** O caminho da lista de notícias: o que vem antes de "news" ("/news/", "/season2/news/", "/news" para "news.html"). */
function newsDirOf(listUrl: URL): string {
  const path = listUrl.pathname.replace(/\/index\.html?$/i, "/").replace(/\.html?$/i, "");
  const at = path.toLowerCase().lastIndexOf("news");
  return at >= 0 ? path.slice(0, at + 4) : path;
}

/** A matéria: mesmo site, dentro do caminho de notícias, e não é a própria lista, uma categoria nem uma página da lista. */
export function isArticleUrl(url: URL, listUrl: URL): boolean {
  if (url.host !== listUrl.host) return false;
  const dir = newsDirOf(listUrl).toLowerCase();
  const path = url.pathname.toLowerCase();
  if (!path.startsWith(dir)) return false;
  const rest = path.slice(dir.length).replace(/^[/_]+/, "");
  const query = url.searchParams;
  if (["category", "category_id", "cat", "page", "paged", "p", "tag", "year"].some((k) => query.has(k))) return false;
  if (/(^|\/)(category|tag|page)\//.test(rest) || /^(feed|rss)\b/.test(rest)) return false;
  // A própria lista ("", "index.html") só conta como matéria se o endereço tem o id da matéria (news/?article_id=71659).
  if (rest === "" || /^index\.html?$/.test(rest) || rest === "/") return query.toString().length > 0;
  return true;
}

/** O endereço da lista de notícias a partir da página inicial (o link mais curto que termina em "news"). */
export function findNewsListUrl(homeHtml: string, homeUrl: string): string | null {
  const html = stripNoise(homeHtml);
  const candidates: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    const url = resolve(m[1], homeUrl);
    if (!url || url.host !== new URL(homeUrl).host || url.search) continue;
    if (/(^|\/)news(\/|\/index\.html?|\.html?)?$/i.test(url.pathname)) candidates.push(url);
  }
  // Prefere a lista dentro do caminho da obra (o site da 2ª temporada fica em /season2/), depois o link mais curto.
  const base = new URL(homeUrl).pathname.replace(/[^/]*$/, "");
  candidates.sort((a, b) => Number(b.pathname.startsWith(base)) - Number(a.pathname.startsWith(base)) || a.pathname.length - b.pathname.length);
  return candidates[0]?.toString() ?? null;
}

/** Feeds anunciados na página (`<link rel="alternate" type="application/rss+xml">`). */
export function feedLinks(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/type\s*=\s*["']application\/(rss|atom)\+xml["']/i.test(tag) || /comments/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const url = href ? resolve(href, pageUrl) : null;
    if (url) out.push(url.toString());
  }
  return out;
}

/**
 * O título do item: o elemento de classe "title"/"ttl" quando há; senão o texto do link, sem a data da lista na frente
 * nem o selo "NEW". Datas no meio do título ("Blu-ray em 2027年1月27日") são conteúdo e ficam.
 */
function itemTitle(block: string, anchorHtml: string, listDate: string): string {
  const titled = /<([a-z0-9]+)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:[\w-]*title[\w-]*|[\w-]*ttl[\w-]*)\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i.exec(block);
  const raw = plain(titled?.[2] ?? "") || plain(anchorHtml);
  const at = raw.indexOf(listDate);
  return (at >= 0 && at < 30 ? raw.slice(0, at) + raw.slice(at + listDate.length) : raw)
    .replace(/^[\s|│・-]*(NEW|new|New)\b\s*/, "")
    .replace(/^[\s|│・-]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Os itens da lista de notícias (HTML): cada bloco com a data e o link de uma matéria. A data da matéria é a primeira do
 * item (a lista vem antes do título); um título pode trazer outra ("Blu-ray em 2027年1月27日"). Mais de duas datas no
 * mesmo bloco é um pedaço grande da página, não um item. Data no futuro não é data de publicação.
 */
export function parseNewsList(html: string, listUrl: string, now: Date = new Date()): OfficialNewsItem[] {
  const list = new URL(listUrl);
  const clean = stripNoise(html);
  const found = new Map<string, OfficialNewsItem>();
  const latest = now.getTime() + 36 * 3600_000;
  const take = (block: string) => {
    const dates = plain(block).match(DATE_RE_ALL) ?? [];
    const listDate = dates[0];
    if (!listDate || new Set(dates.map((d) => parseSiteDate(d)?.getTime())).size > 2) return;
    for (const a of block.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = resolve(a[1], listUrl);
      if (!url || !isArticleUrl(url, list)) continue;
      url.hash = "";
      if (found.has(url.toString())) return;
      const publishedAt = parseSiteDate(listDate);
      const title = itemTitle(block, a[2], listDate);
      if (!publishedAt || publishedAt.getTime() > latest || !title) return;
      found.set(url.toString(), { url: url.toString(), title, excerpt: null, publishedAt });
      return;
    }
  };
  // 1) Cada item da lista: <li>, <article>, <tr> ou <dt> até o próximo (a data pode estar fora do link).
  for (const block of clean.split(/(?=<(?:li|article|tr|dt)\b)/i)) take(block);
  // 2) Listas sem esses itens: o próprio link, com a data dentro dele.
  for (const a of clean.matchAll(/<a\b[^>]*\bhref\s*=\s*["'][^"'#]+["'][^>]*>[\s\S]*?<\/a>/gi)) take(a[0]);
  return Array.from(found.values()).sort((x, y) => y.publishedAt.getTime() - x.publishedAt.getTime());
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", processEntities: true });

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text((value as Record<string, unknown>)["#text"]);
  return "";
}

/**
 * Itens do feed (RSS 2.0 ou Atom) que são notícias da obra: o feed geral de um WordPress às vezes só tem o "Hello world!"
 * de exemplo e as notícias ficam noutro tipo de conteúdo — só entra o que está no caminho de notícias da lista.
 */
export function parseOfficialFeed(body: string, listUrl: string): OfficialNewsItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = xml.parse(body);
  } catch {
    return [];
  }
  const rss = (doc.rss as Record<string, Record<string, unknown>> | undefined)?.channel?.item;
  const atom = (doc.feed as Record<string, unknown> | undefined)?.entry;
  const raw = rss ?? atom;
  const entries = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
  const list = new URL(listUrl);
  const items: OfficialNewsItem[] = [];
  for (const e of entries) {
    const linkField = e.link;
    const href = typeof linkField === "string" ? linkField : Array.isArray(linkField) ? text((linkField[0] as Record<string, unknown>)?.["@href"]) : text((linkField as Record<string, unknown> | undefined)?.["@href"]);
    const url = href ? resolve(href, listUrl) : null;
    const title = plain(text(e.title)).slice(0, 300);
    const publishedAt = new Date(text(e.pubDate) || text(e.published) || text(e.updated));
    if (!url || !isArticleUrl(url, list) || !title || Number.isNaN(publishedAt.getTime())) continue;
    const excerpt = plain(text(e.description) || text(e.summary)).slice(0, 400) || null;
    items.push({ url: url.toString(), title, excerpt, publishedAt });
  }
  return items;
}

/** O que o `robots.txt` proíbe para todos (`User-agent: *`) ou para este robô: a regra mais longa vence, como no padrão. */
export function robotsAllows(robots: string, path: string): boolean {
  const rules: Array<{ allow: boolean; prefix: string }> = [];
  let applies = false;
  let lastWasAgent = false;
  for (const line of robots.split(/\r?\n/)) {
    const [field, ...rest] = line.replace(/#.*/, "").split(":");
    const key = field.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      const mine = value === "*" || OFFICIAL_NEWS_USER_AGENT.toLowerCase().startsWith(value.toLowerCase());
      applies = lastWasAgent ? applies || mine : mine;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (applies && (key === "allow" || key === "disallow") && value) rules.push({ allow: key === "allow", prefix: value.replace(/\*$/, "") });
  }
  const match = rules.filter((r) => path.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length || Number(b.allow) - Number(a.allow))[0];
  return match ? match.allow : true;
}

/** Endereço de rede interna (localhost, 10.x, 192.168.x…): nunca é site oficial; só os testes liberam. */
function isPrivateHost(host: string): boolean {
  if (process.env.OFFICIAL_NEWS_ALLOW_PRIVATE_HOSTS === "1") return false;
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || /^f[cd][0-9a-f]{2}:/.test(h);
}

export type Fetcher = (url: string) => Promise<{ status: number; url: string; contentType: string; body: string } | null>;

const MAX_BYTES = 1_500_000;

export const defaultFetcher: Fetcher = async (url) => {
  try {
    const res = await fetch(url, { headers: { "User-Agent": OFFICIAL_NEWS_USER_AGENT, Accept: "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    const contentType = res.headers.get("content-type") ?? "";
    const body = res.ok ? (await res.text()).slice(0, MAX_BYTES) : "";
    return { status: res.status, url: res.url || url, contentType, body };
  } catch {
    return null;
  }
};

const looksLikeFeed = (body: string) => /<(rss|feed)\b/i.test(body.slice(0, 2000));

/**
 * As notícias do site oficial de uma obra. `robotsCache` guarda o robots.txt de cada site durante a execução (várias
 * temporadas da mesma obra no mesmo site). Devolve null quando o site não respondeu ou não deixa ler.
 */
export async function fetchOfficialNews(siteUrl: string, fetcher: Fetcher = defaultFetcher, robotsCache = new Map<string, string>(), now: Date = new Date()): Promise<OfficialNewsItem[] | null> {
  const site = resolve(siteUrl, siteUrl);
  if (!site || isPrivateHost(site.hostname)) return null;
  const allowed = async (target: string) => {
    const u = new URL(target);
    if (isPrivateHost(u.hostname)) return false;
    if (!robotsCache.has(u.origin)) {
      const robots = await fetcher(`${u.origin}/robots.txt`);
      robotsCache.set(u.origin, robots && robots.status === 200 && !/<html/i.test(robots.body.slice(0, 500)) ? robots.body : "");
    }
    return robotsAllows(robotsCache.get(u.origin) ?? "", u.pathname);
  };
  const get = async (target: string) => ((await allowed(target)) ? fetcher(target) : null);

  const home = await get(site.toString());
  if (!home || home.status !== 200 || !home.body) return null;
  const listUrl = findNewsListUrl(home.body, home.url) ?? new URL("news/", home.url.replace(/[^/]*$/, "")).toString();
  const list = await get(listUrl);
  const listOk = list && list.status === 200 && list.body ? list : null;

  // 1) Feed: o anunciado na lista ou na página inicial; num WordPress, o feed da própria lista (news/feed/).
  const feeds = [...(listOk ? feedLinks(listOk.body, listOk.url) : []), ...feedLinks(home.body, home.url)];
  if (/wp-content|wp-json/i.test(home.body + (listOk?.body ?? ""))) feeds.unshift(new URL("feed/", (listOk?.url ?? listUrl).replace(/\/?(index\.html?)?$/i, "/")).toString());
  const base = listOk?.url ?? listUrl;
  for (const feed of Array.from(new Set(feeds)).slice(0, 2)) {
    const res = await get(feed);
    if (!res || res.status !== 200 || !looksLikeFeed(res.body)) continue;
    const items = parseOfficialFeed(res.body, base);
    if (items.length > 0) return items;
  }
  // 2) A lista de notícias.
  return listOk ? parseNewsList(listOk.body, listOk.url, now) : null;
}
