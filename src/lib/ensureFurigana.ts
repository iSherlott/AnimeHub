import { prisma } from "@/lib/prisma";
import { toFuriganaHtml } from "@/lib/furigana";
import type { Anime } from "@prisma/client";

/**
 * Garante que anime.titleFurigana esteja preenchido, gerando (e cacheando)
 * a partir de titleNative na primeira vez que for pedido.
 */
export async function ensureTitleFurigana(anime: Anime): Promise<string | null> {
  if (anime.titleFurigana) return anime.titleFurigana;
  if (!anime.titleNative) return null;

  try {
    const html = await toFuriganaHtml(anime.titleNative);
    await prisma.anime.update({
      where: { id: anime.id },
      data: { titleFurigana: html },
    });
    return html;
  } catch (error) {
    console.error("Falha ao gerar furigana:", error);
    return null;
  }
}
