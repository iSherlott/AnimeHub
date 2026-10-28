/**
 * Spoilers no AnimeHub (28/10), em três níveis:
 * - o conteúdo inteiro marcado como spoiler (publicação, comentário, tópico, resposta, recado, depoimento, evento);
 * - um trecho do texto, escrito entre barras duplas: `||o Himmel morre||` — o trecho fica coberto até a pessoa tocar;
 * - uma imagem marcada como spoiler — fica borrada até a pessoa tocar.
 * O aviso diz de qual obra e até onde (`spoilerLabel`), e a pessoa escolhe em Configurações se pergunta antes
 * (padrão) ou mostra direto — sempre com a marca de que é spoiler.
 */

const SPOILER_RE = /\|\|([\s\S]+?)\|\|/g;

export type SpoilerSegment = { spoiler: boolean; text: string };

/** Divide o texto em trechos normais e trechos de spoiler (`||…||`). Barras soltas ficam como estão. */
export function splitSpoilers(text: string): SpoilerSegment[] {
  const out: SpoilerSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(SPOILER_RE)) {
    const inner = match[1];
    // `||  ||` (só espaço) não é spoiler: fica como texto.
    if (!inner.trim()) continue;
    if (match.index > last) out.push({ spoiler: false, text: text.slice(last, match.index) });
    out.push({ spoiler: true, text: inner });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ spoiler: false, text: text.slice(last) });
  return out.length ? out : [{ spoiler: false, text }];
}

export function hasInlineSpoiler(text: string): boolean {
  return splitSpoilers(text).some((s) => s.spoiler);
}

/** Para onde o texto aparece sem a cobertura (citação, busca, prévias): o trecho vira "[spoiler]". */
export function maskSpoilers(text: string): string {
  return splitSpoilers(text)
    .map((s) => (s.spoiler ? "[spoiler]" : s.text))
    .join("");
}

/** Sem os trechos de spoiler (para tirar hashtags de dentro deles: senão a hashtag revelaria o trecho). */
export function stripSpoilers(text: string): string {
  return splitSpoilers(text)
    .map((s) => (s.spoiler ? " " : s.text))
    .join("");
}

export const MAX_SPOILER_EPISODE = 9999;

/** "Até o episódio" informado por quem escreveu: inteiro de 1 a 9999, ou nada. `undefined` = valor inválido. */
export function parseSpoilerEpisode(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > MAX_SPOILER_EPISODE) return undefined;
  return n;
}

/** O aviso: "Spoiler de Frieren · até o episódio 18", "Spoiler de Frieren" ou só "Spoiler". */
export function spoilerLabel(context: { work?: string | null; episode?: number | null } = {}): string {
  const work = context.work?.trim();
  const base = work ? `Spoiler de ${work}` : "Spoiler";
  return context.episode ? `${base} · até o episódio ${context.episode}` : base;
}

/**
 * Corta o texto em `max` caracteres sem partir um trecho de spoiler ao meio (partido, as barras sumiam e o trecho
 * aparecia descoberto): o trecho entra inteiro ou fica de fora. Devolve o texto cortado e se houve corte.
 */
export function truncateKeepingSpoilers(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  let out = "";
  let used = 0;
  for (const segment of splitSpoilers(text)) {
    if (segment.spoiler) {
      if (used + segment.text.length > max) return { text: out, truncated: true };
      out += `||${segment.text}||`;
      used += segment.text.length;
      continue;
    }
    const room = max - used;
    if (segment.text.length > room) return { text: out + segment.text.slice(0, room), truncated: true };
    out += segment.text;
    used += segment.text.length;
  }
  return { text: out, truncated: out !== text };
}
