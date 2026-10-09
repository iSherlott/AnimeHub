/**
 * Converte a sinopse da AniList (que traz <br>, <i>, <b>… mesmo com
 * `asHtml: false`) em TEXTO PURO — nunca vira HTML na página pública
 * (GAP-S-05: dangerouslySetInnerHTML com dado de terceiros).
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function htmlToPlainText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FURIGANA_TAGS = new Set(["ruby", "rt", "rp"]);

/**
 * O HTML de furigana (kuroshiro) só precisa de <ruby>/<rt>/<rp>. Qualquer
 * outra tag/atributo é descartado e o texto restante é escapado, para que
 * `dangerouslySetInnerHTML` nunca receba marcação arbitrária (GAP-S-05).
 */
export function sanitizeFuriganaHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .split(/(<[^>]*>)/)
    .map((token) => {
      const tag = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)[^>]*>$/.exec(token);
      if (tag) {
        const name = tag[2].toLowerCase();
        return FURIGANA_TAGS.has(name) ? `<${tag[1]}${name}>` : "";
      }
      return token.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    })
    .join("");
}
