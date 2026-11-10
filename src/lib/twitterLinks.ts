/**
 * O X (antigo Twitter) oficial da obra, dos links "Twitter" da AniList (`externalLinks`, tipo SOCIAL). Uma obra pode ter
 * mais de um: o japonês (o da produção, em geral `<obra>_PR` ou `<obra>_anime`) e o da distribuidora em inglês. Guardado
 * em `CatalogEntry.twitterLinksJson` como JSON `[{ handle, url, language }]`, o japonês primeiro.
 */
export type TwitterLink = { handle: string; url: string; language: string | null };

const RESERVED_PATHS = new Set(["home", "intent", "share", "search", "hashtag", "i", "explore", "settings"]);

/** "https://twitter.com/kusuriya_PR" ou "https://x.com/aonohako_PR/" → { handle: "kusuriya_PR", url: "https://x.com/kusuriya_PR" }. */
export function normalizeTwitterUrl(raw: string | null | undefined): { handle: string; url: string } | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !/^(www\.|mobile\.)?(twitter|x)\.com$/i.test(url.hostname)) return null;
  const handle = url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") ?? "";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || RESERVED_PATHS.has(handle.toLowerCase())) return null;
  return { handle, url: `https://x.com/${handle}` };
}

/** Os links de X de uma obra, sem repetir a conta, o japonês primeiro. */
export function twitterLinksFrom(links: ReadonlyArray<{ site: string; url: string | null; type?: string | null; language?: string | null; isDisabled?: boolean | null }>): TwitterLink[] {
  const seen = new Set<string>();
  const out: TwitterLink[] = [];
  for (const link of links) {
    if (!/^(twitter|x)$/i.test(link.site) || link.isDisabled) continue;
    const normalized = normalizeTwitterUrl(link.url);
    if (!normalized || seen.has(normalized.handle.toLowerCase())) continue;
    seen.add(normalized.handle.toLowerCase());
    out.push({ ...normalized, language: link.language ?? null });
  }
  const rank = (l: TwitterLink) => (l.language === "Japanese" ? 0 : l.language === null ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Lê o que está guardado no catálogo (ignora o que não for um link de X válido). */
export function parseTwitterLinks(json: string | null | undefined): TwitterLink[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const normalized = normalizeTwitterUrl((item as { url?: string })?.url);
      return normalized ? [{ ...normalized, language: typeof (item as { language?: unknown }).language === "string" ? (item as { language: string }).language : null }] : [];
    });
  } catch {
    return [];
  }
}

/** Em que língua a conta posta, quando não é a japonesa (a principal): "inglês" etc. */
export function twitterLanguageLabel(language: string | null): string | null {
  if (!language || language === "Japanese") return null;
  return ({ English: "inglês", Spanish: "espanhol", Portuguese: "português", Korean: "coreano", Chinese: "chinês", French: "francês", German: "alemão" } as Record<string, string>)[language] ?? language;
}
