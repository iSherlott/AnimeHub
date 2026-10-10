import { prisma } from "@/lib/prisma";
import { toFuriganaHtml, toKana } from "@/lib/furigana";

export type Reading = { kana: string; html: string };

export const MAX_READINGS_PER_REQUEST = 100;
export const MAX_READING_LENGTH = 120;

/** Só títulos com kanji/kana valem a pena (e impede pedir leitura de texto qualquer). */
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;

export function readableTexts(texts: unknown): string[] {
  if (!Array.isArray(texts)) return [];
  const seen = new Set<string>();
  for (const t of texts) {
    if (typeof t !== "string") continue;
    const text = t.trim();
    if (text.length === 0 || text.length > MAX_READING_LENGTH || !JAPANESE.test(text)) continue;
    seen.add(text);
    if (seen.size >= MAX_READINGS_PER_REQUEST) break;
  }
  return Array.from(seen);
}

/**
 * Kana e furigana de cada título japonês: lidos do cache (`TitleReading`) e,
 * para os que faltam, gerados com kuroshiro e guardados — cada título é
 * convertido uma única vez. Falha de um título não derruba os demais.
 */
export async function getReadings(texts: string[]): Promise<Record<string, Reading>> {
  const result: Record<string, Reading> = {};
  if (texts.length === 0) return result;
  const cached = await prisma.titleReading.findMany({ where: { text: { in: texts } } });
  for (const row of cached) result[row.text] = { kana: row.kana, html: row.furiganaHtml };

  for (const text of texts) {
    if (result[text]) continue;
    try {
      const [kana, html] = await Promise.all([toKana(text), toFuriganaHtml(text)]);
      await prisma.titleReading.upsert({ where: { text }, create: { text, kana, furiganaHtml: html }, update: { kana, furiganaHtml: html } });
      result[text] = { kana, html };
    } catch (error) {
      console.error("[readings] falhou para um título:", error);
    }
  }
  return result;
}
