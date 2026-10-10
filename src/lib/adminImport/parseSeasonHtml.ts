/**
 * Parser do HTML de temporada colado no Admin → Importações (Figma `8:3894`).
 *
 * O conteúdo é SEMPRE tratado como texto: nada é executado nem renderizado como
 * HTML (scripts, estilos e comentários são descartados antes de ler). A coleta
 * automática de sites de terceiros segue proibida (D-30) — aqui só entra o que
 * uma pessoa administradora colou, com origem e versão do parser registradas.
 *
 * Contrato do HTML aceito (campos ausentes ficam ausentes, nunca inventados):
 *
 *   <section data-season="Autumn2026">
 *     <article data-anidb-id="19777" data-type="TV" data-year="2026" data-aired="2026-10-10T16:00:00Z">
 *       <h2>Yasei no Last Boss ga Arawareta!</h2>
 *       <p lang="ja">野生のラスボスが現れた！</p>
 *       <p lang="en">A Wild Last Boss Appeared!</p>
 *     </article>
 *   </section>
 *
 * Também lê a listagem de temporada do próprio AniDB (caixas `g_bubble box` com
 * nome, data "25th September", tipo "TV Series, 12 eps", sinopse e ícones de
 * streaming). Ela não traz o ano: ele vem da temporada escolhida no lote.
 */
export const PARSER_VERSION = "2.0.0";
export const MAX_HTML_BYTES = 1_000_000;
export const MAX_RECORDS = 500;

import type { SeasonRef } from "@/lib/exploreGroups";

export type ParsedRecord = {
  sourceKey: string;
  titleRomaji: string;
  titleNative: string | null;
  titleEnglish: string | null;
  year: number | null;
  format: string | null;
  airsAt: Date | null;
  /** `false` quando a fonte só informa o dia (sem horário). */
  airsAtHasTime: boolean;
  description: string | null;
  episodes: number | null;
  imageUrl: string | null;
  /** Sites de streaming que a fonte indica (só http/https). */
  links: Array<{ site: string; url: string }>;
};

export type ParseResult = {
  records: ParsedRecord[];
  seasonLabel: string | null;
  skipped: number;
  warnings: string[];
};

const FORMATS = new Set(["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"]);

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of source.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? "");
  }
  return attrs;
}

/** Texto do primeiro elemento `<tag … lang="xx">…</tag>` do idioma pedido. */
function langText(inner: string, lang: string): string | null {
  const re = new RegExp(`<(\\w+)\\b[^>]*\\blang\\s*=\\s*["']${lang}["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
  const m = re.exec(inner);
  const text = m ? stripTags(m[2]) : "";
  return text ? text.slice(0, 300) : null;
}

/** Data/hora da fonte: só dia (`YYYY-MM-DD`) ou data+hora ISO; qualquer outra coisa é ignorada. */
export function parseSourceDate(value: string | undefined): { at: Date; hasTime: boolean } | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const at = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(at.getTime()) ? null : { at, hasTime: false };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) {
    const at = new Date(v);
    return Number.isNaN(at.getTime()) ? null : { at, hasTime: true };
  }
  return null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const RESOURCE_SITES: Record<string, string> = {
  crunchyroll: "Crunchyroll",
  netflix: "Netflix",
  youtube: "YouTube",
  amazon_video: "Amazon Prime Video",
  hidive: "HIDIVE",
  disney_plus: "Disney+",
  hulu: "Hulu",
  bilibili: "Bilibili",
  muse_asia: "Muse Asia",
  ani_one: "Ani-One",
  wakanim: "Wakanim",
  funimation: "Funimation",
};

function resourceSite(key: string): string {
  return RESOURCE_SITES[key] ?? key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** "25th September" (+ ano da temporada) → data do dia, sem horário. Dezembro numa temporada de inverno é do ano anterior. */
export function parseAnidbDay(text: string, season: SeasonRef | null): Date | null {
  const m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const day = Number(m[1]);
  let year = m[3] ? Number(m[3]) : season?.year;
  if (year === undefined) return null;
  if (!m[3] && season?.season === "WINTER" && month >= 10) year -= 1;
  const at = new Date(Date.UTC(year, month, day));
  return at.getUTCMonth() === month && at.getUTCDate() === day ? at : null;
}

/** "TV Series, 12 eps" → formato AniList-like + nº de episódios. */
export function parseAnidbGeneral(text: string): { format: string | null; episodes: number | null } {
  const [kind, count] = text.split(",").map((t) => t.trim());
  const key = kind.toLowerCase();
  const format = key.startsWith("tv series") ? "TV" : key.startsWith("tv special") ? "SPECIAL" : key.startsWith("movie") ? "MOVIE" : key.startsWith("web") ? "ONA" : key.startsWith("ova") ? "OVA" : key.startsWith("music") ? "MUSIC" : null;
  const eps = count ? /(\d+)\s*ep/i.exec(count) : null;
  return { format, episodes: eps ? Number(eps[1]) : null };
}

function innerOf(chunk: string, className: string): string | null {
  const m = new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`, "i").exec(chunk);
  return m ? m[1] : null;
}

/** Listagem de temporada do AniDB: cada anime é uma `<div class="… g_bubble box …" id="a123">`. */
function parseAnidbBoxes(clean: string, season: SeasonRef | null, warnings: string[]): { records: ParsedRecord[]; skipped: number } {
  const starts = Array.from(clean.matchAll(/<div\b[^>]*class="[^"]*\bg_bubble\b[^"]*\bbox\b[^"]*"[^>]*\bid="a(\d+)"[^>]*>/gi));
  const records: ParsedRecord[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  starts.forEach((start, i) => {
    if (records.length >= MAX_RECORDS) {
      if (records.length === MAX_RECORDS) warnings.push(`Limite de ${MAX_RECORDS} registros atingido; o restante foi ignorado.`);
      return;
    }
    const sourceKey = start[1];
    const chunk = clean.slice(start.index, i + 1 < starts.length ? starts[i + 1].index : clean.length);
    if (seen.has(sourceKey)) {
      skipped += 1;
      warnings.push(`AniDB #${sourceKey} aparece mais de uma vez; só a primeira ocorrência foi lida.`);
      return;
    }
    const nameMatch = /<a\b[^>]*class="[^"]*\bname-colored\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
    const titleRomaji = nameMatch ? stripTags(nameMatch[1]).slice(0, 300) : "";
    if (!titleRomaji) {
      skipped += 1;
      warnings.push(`AniDB #${sourceKey} não tem título e foi ignorado.`);
      return;
    }
    seen.add(sourceKey);

    const dateText = innerOf(chunk, "date");
    const airsAt = dateText ? parseAnidbDay(stripTags(dateText), season) : null;
    const general = parseAnidbGeneral(stripTags(innerOf(chunk, "general") ?? ""));
    const desc = innerOf(chunk, "desc");
    const description = desc ? stripTags(desc).slice(0, 4000) || null : null;
    const image = /<img\b[^>]*\bsrc="([^"]+)"/i.exec(chunk);
    const imageUrl = image && /^https:\/\//i.test(decodeEntities(image[1])) ? decodeEntities(image[1]) : null;

    const links: Array<{ site: string; url: string }> = [];
    for (const link of chunk.matchAll(/<a\b([^>]*)>/gi)) {
      const attrs = parseAttrs(link[1]);
      const resource = /\bi_resource_(\w+)/.exec(attrs.class ?? "");
      if (!resource || !attrs.href || !/^https?:\/\//i.test(attrs.href)) continue;
      const site = resourceSite(resource[1]);
      if (!links.some((l) => l.site === site)) links.push({ site, url: attrs.href });
    }

    records.push({
      sourceKey,
      titleRomaji,
      titleNative: null,
      titleEnglish: null,
      year: season?.year ?? airsAt?.getUTCFullYear() ?? null,
      format: general.format,
      airsAt,
      airsAtHasTime: false,
      description,
      episodes: general.episodes,
      imageUrl,
      links,
    });
  });
  return { records, skipped };
}

export function parseSeasonHtml(html: string, options: { season?: SeasonRef | null } = {}): ParseResult {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ");

  const warnings: string[] = [];
  const seasonMatch = /<section\b([^>]*)>/i.exec(clean);
  const seasonLabel = seasonMatch ? (parseAttrs(seasonMatch[1])["data-season"]?.trim() || null) : null;

  if (/\bg_bubble\b[^"]*\bbox\b/i.test(clean)) {
    const anidb = parseAnidbBoxes(clean, options.season ?? null, warnings);
    // Conferência de completude: todo nome de anime do HTML precisa ter virado registro (ou ter sido recusado com aviso).
    const names = (clean.match(/<a\b[^>]*class="[^"]*\bname-colored\b/gi) ?? []).length;
    const accounted = anidb.records.length + anidb.skipped;
    if (names > accounted && anidb.records.length < MAX_RECORDS) {
      warnings.push(`O HTML tem ${names} títulos, mas só ${accounted} foram lidos. Confira se a listagem foi colada por inteiro.`);
    }
    return { records: anidb.records, seasonLabel, skipped: anidb.skipped, warnings };
  }

  const records: ParsedRecord[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const match of clean.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article\s*>/gi)) {
    if (records.length >= MAX_RECORDS) {
      warnings.push(`Limite de ${MAX_RECORDS} registros atingido; o restante foi ignorado.`);
      break;
    }
    const attrs = parseAttrs(match[1]);
    const inner = match[2];

    const sourceKey = (attrs["data-anidb-id"] ?? attrs["data-id"] ?? "").trim();
    if (!/^\d{1,9}$/.test(sourceKey)) {
      skipped += 1;
      warnings.push("Registro sem identificador AniDB válido foi ignorado.");
      continue;
    }
    if (seen.has(sourceKey)) {
      skipped += 1;
      warnings.push(`AniDB #${sourceKey} aparece mais de uma vez; só a primeira ocorrência foi lida.`);
      continue;
    }
    const headingMatch = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/i.exec(inner);
    const titleRomaji = headingMatch ? stripTags(headingMatch[1]).slice(0, 300) : "";
    if (!titleRomaji) {
      skipped += 1;
      warnings.push(`AniDB #${sourceKey} não tem título e foi ignorado.`);
      continue;
    }
    seen.add(sourceKey);

    const timeMatch = /<time\b([^>]*)>/i.exec(inner);
    const date = parseSourceDate(attrs["data-aired"] ?? (timeMatch ? parseAttrs(timeMatch[1]).datetime : undefined));
    const yearRaw = Number(attrs["data-year"]);
    const year = Number.isInteger(yearRaw) && yearRaw >= 1900 && yearRaw <= 2100 ? yearRaw : date ? date.at.getUTCFullYear() : null;
    const format = (attrs["data-type"] ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");

    records.push({
      sourceKey,
      titleRomaji,
      titleNative: langText(inner, "ja"),
      titleEnglish: langText(inner, "en"),
      year,
      format: FORMATS.has(format) ? format : null,
      airsAt: date?.at ?? null,
      airsAtHasTime: date?.hasTime ?? false,
      description: null,
      episodes: null,
      imageUrl: null,
      links: [],
    });
  }

  return { records, seasonLabel, skipped, warnings };
}
