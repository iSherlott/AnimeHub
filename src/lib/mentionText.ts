/**
 * Menções com @ (12/11/2026): `@handle` numa publicação ou comentário avisa a pessoa no sino e vira link para o perfil.
 * Regras do @ (src/lib/handle.ts): 3 a 20 letras minúsculas, números ou _. Não conta como menção o @ grudado numa
 * palavra (e-mail: ana@site.com) nem dentro de um endereço. Este arquivo não usa o banco: o navegador também usa.
 */
export const MAX_MENTIONS_PER_TEXT = 5;

const MENTION_RE = /(^|[^\p{L}\p{N}_@/.])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/gu;

/** Os @ do texto, em minúsculas, sem repetir, até o limite. */
export function extractMentions(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const handle = m[2].toLowerCase();
    if (!found.includes(handle)) found.push(handle);
    if (found.length >= MAX_MENTIONS_PER_TEXT) break;
  }
  return found;
}

export type MentionSegment = { type: "text"; value: string } | { type: "mention"; value: string; handle: string };

/** Quebra o texto em trechos comuns e menções (para desenhar o @ como link). */
export function splitMentions(text: string): MentionSegment[] {
  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    out.push({ type: "mention", value: `@${m[2]}`, handle: m[2].toLowerCase() });
    last = start + m[2].length + 1;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
