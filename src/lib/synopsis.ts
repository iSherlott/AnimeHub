import { prisma } from "@/lib/prisma";
import { htmlToPlainText } from "@/lib/plainText";
import { translateText, type TranslationTarget } from "@/lib/translate";

export type SynopsisResult = { text: string; lang: TranslationTarget | "en"; translated: boolean };

export function isTranslationTarget(value: unknown): value is TranslationTarget {
  return value === "pt" || value === "ja";
}

/** Sinopse original (inglês) da obra: Production, depois o catálogo importado. */
export async function originalSynopsis(anilistId: number): Promise<string> {
  const production = await prisma.production.findUnique({ where: { anilistId }, select: { description: true } });
  if (production?.description) return htmlToPlainText(production.description);
  const entry = await prisma.catalogEntry.findUnique({ where: { anilistId }, select: { description: true } });
  return htmlToPlainText(entry?.description);
}

/**
 * Sinopse da obra no idioma pedido. Traduz na primeira vez e guarda
 * (SynopsisTranslation); se a tradução falhar, devolve o original em inglês
 * (`translated: false`) sem guardar nada — uma próxima visita tenta de novo.
 */
export async function getSynopsis(anilistId: number, lang: TranslationTarget): Promise<SynopsisResult | null> {
  const cached = await prisma.synopsisTranslation.findUnique({ where: { anilistId_lang: { anilistId, lang } } });
  if (cached) return { text: cached.text, lang, translated: true };

  const original = await originalSynopsis(anilistId);
  if (!original) return null;
  try {
    const text = await translateText(original, lang);
    await prisma.synopsisTranslation.upsert({
      where: { anilistId_lang: { anilistId, lang } },
      create: { anilistId, lang, text, source: process.env.LIBRETRANSLATE_URL ? "libretranslate" : "mymemory" },
      update: { text },
    });
    return { text, lang, translated: true };
  } catch (error) {
    console.error("[synopsis] tradução falhou:", error);
    return { text: original, lang: "en", translated: false };
  }
}
