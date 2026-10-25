import { prisma } from "@/lib/prisma";
import { htmlToPlainText } from "@/lib/plainText";
import { translateText, translationEngine, type TranslationTarget } from "@/lib/translate";

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
 * Guarda a sinopse traduzida: na obra do catálogo (`descriptionPt`/`descriptionJa`, que vale também para as obras só do
 * AniDB, sem `anilistId`) e, quando há `anilistId`, no cache de traduções (`SynopsisTranslation`).
 */
export async function storeSynopsis({ entryId, anilistId, lang, text }: { entryId?: string; anilistId?: number | null; lang: TranslationTarget; text: string }): Promise<void> {
  // Tradução automática (Fase 7): marcada como tal, e nunca por cima de uma revisada ou escrita pelo admin (protegida).
  const column = lang === "pt" ? { descriptionPt: text, descriptionPtStatus: "AUTO", descriptionPtSource: translationEngine(), descriptionPtReviewedBy: null, descriptionPtReviewedAt: null } : { descriptionJa: text };
  const unprotected = lang === "pt" ? { NOT: { manualFields: { has: "descriptionPt" } } } : {};
  if (entryId) await prisma.catalogEntry.updateMany({ where: { id: entryId, ...unprotected }, data: column }).catch(() => undefined);
  else if (anilistId) await prisma.catalogEntry.updateMany({ where: { anilistId, ...unprotected }, data: column });
  if (anilistId) {
    await prisma.synopsisTranslation.upsert({
      where: { anilistId_lang: { anilistId, lang } },
      create: { anilistId, lang, text, source: translationEngine() },
      update: { text, source: translationEngine() },
    });
  }
}

/**
 * Sinopse da obra no idioma pedido. Lê primeiro a tradução já guardada (na obra do catálogo ou no cache de traduções);
 * se não houver, traduz na primeira vez e guarda. Se a tradução falhar, devolve o original em inglês (`translated: false`)
 * sem guardar nada — uma próxima visita tenta de novo.
 */
export async function getSynopsis(anilistId: number, lang: TranslationTarget): Promise<SynopsisResult | null> {
  const entry = await prisma.catalogEntry.findUnique({ where: { anilistId }, select: { id: true, descriptionPt: true, descriptionJa: true } });
  const stored = lang === "pt" ? entry?.descriptionPt : entry?.descriptionJa;
  if (stored) return { text: stored, lang, translated: true };

  const cached = await prisma.synopsisTranslation.findUnique({ where: { anilistId_lang: { anilistId, lang } } });
  if (cached) {
    if (entry) await storeSynopsis({ entryId: entry.id, lang, text: cached.text }); // a obra passa a ter a tradução à mão
    return { text: cached.text, lang, translated: true };
  }

  const original = await originalSynopsis(anilistId);
  if (!original) return null;
  try {
    const text = await translateText(original, lang);
    await storeSynopsis({ entryId: entry?.id, anilistId, lang, text });
    return { text, lang, translated: true };
  } catch (error) {
    console.error("[synopsis] tradução falhou:", error);
    return { text: original, lang: "en", translated: false };
  }
}

/** Sinopse de uma obra do catálogo que não tem `anilistId` (só do AniDB): lida e guardada pelo id da própria obra. */
export async function getSynopsisByEntry(entryId: string, lang: TranslationTarget): Promise<SynopsisResult | null> {
  const entry = await prisma.catalogEntry.findUnique({ where: { id: entryId }, select: { id: true, anilistId: true, description: true, descriptionPt: true, descriptionJa: true } });
  if (!entry) return null;
  if (entry.anilistId) return getSynopsis(entry.anilistId, lang);
  const stored = lang === "pt" ? entry.descriptionPt : entry.descriptionJa;
  if (stored) return { text: stored, lang, translated: true };
  const original = htmlToPlainText(entry.description);
  if (!original) return null;
  try {
    const text = await translateText(original, lang);
    await storeSynopsis({ entryId: entry.id, lang, text });
    return { text, lang, translated: true };
  } catch (error) {
    console.error("[synopsis] tradução falhou:", error);
    return { text: original, lang: "en", translated: false };
  }
}
