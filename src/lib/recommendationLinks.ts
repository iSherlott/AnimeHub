import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveWorkKey } from "@/lib/workRef";
import { NOTE_MAX } from "@/lib/workRecommendations";
import { htmlToPlainText } from "@/lib/plainText";

/**
 * Recomendar por link (11/11/2026), para quem não tem conta no AnimeHub: a pessoa gera um link da obra com o bilhete e
 * manda por fora (WhatsApp, por exemplo). O link abre uma página pública — a obra, a sinopse e o recado de quem recomendou —
 * e de lá a página da obra no catálogo, que visitante já pode ver. Um link por pessoa e obra: gerar de novo atualiza o
 * bilhete e mantém o endereço. Nada da conta de quem recomendou aparece além do nome de exibição.
 */
const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

export function newLinkCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export const isLinkCode = (code: string) => /^[a-km-zA-HJ-NP-Z2-9]{10}$/.test(code);

export type LinkResult = { ok: true; code: string } | { ok: false; status: 400 | 404; error: string };

export async function createRecommendationLink(fromId: string, input: { work?: unknown; note?: unknown }): Promise<LinkResult> {
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > NOTE_MAX) return { ok: false, status: 400, error: `O bilhete pode ter até ${NOTE_MAX} caracteres.` };
  const work = await resolveWorkKey(typeof input.work === "string" || typeof input.work === "number" ? input.work : null);
  if (!work) return { ok: false, status: 404, error: "Obra não encontrada." };
  const existing = await prisma.recommendationLink.findUnique({ where: { fromId_workKey: { fromId, workKey: work.key } }, select: { code: true } });
  if (existing) {
    await prisma.recommendationLink.update({ where: { fromId_workKey: { fromId, workKey: work.key } }, data: { note: note || null } });
    return { ok: true, code: existing.code };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const row = await prisma.recommendationLink.create({ data: { code: newLinkCode(), fromId, workKey: work.key, note: note || null } });
      return { ok: true, code: row.code };
    } catch {
      // Código repetido (raríssimo): tenta outro.
    }
  }
  return { ok: false, status: 400, error: "Não foi possível gerar o link agora." };
}

export type PublicRecommendation = {
  code: string;
  from: string;
  note: string | null;
  work: { key: string; titleRomaji: string; titleEnglish: string | null; titleNative: string | null; coverImage: string | null; bannerImage: string | null; synopsis: string | null; genres: string[]; seasonYear: number | null; episodes: number | null; format: string | null };
};

/** O que a página pública mostra. `countView` soma uma visita (a página conta; a prévia do link não). */
export async function loadRecommendationLink(code: string, { countView = false } = {}): Promise<PublicRecommendation | null> {
  if (!isLinkCode(code)) return null;
  const link = await prisma.recommendationLink.findUnique({ where: { code }, include: { from: { select: { displayName: true } } } });
  if (!link) return null;
  const work = await resolveWorkKey(link.workKey);
  if (!work) return null;
  const entry = await prisma.catalogEntry.findFirst({
    where: work.anilistId !== null ? { anilistId: work.anilistId } : { id: work.catalogEntryId as string },
    select: { titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true, bannerImage: true, description: true, descriptionPt: true, genres: true, seasonYear: true, episodes: true, format: true },
  });
  if (!entry) return null;
  if (countView) await prisma.recommendationLink.update({ where: { code }, data: { views: { increment: 1 } } }).catch(() => undefined);
  return {
    code,
    from: link.from.displayName,
    note: link.note,
    work: {
      key: work.key,
      titleRomaji: entry.titleRomaji,
      titleEnglish: entry.titleEnglish,
      titleNative: entry.titleNative,
      coverImage: entry.coverImage,
      bannerImage: entry.bannerImage,
      // Sinopse em português quando já traduzida; senão a original.
      synopsis: entry.descriptionPt || entry.description ? htmlToPlainText((entry.descriptionPt || entry.description) as string) : null,
      genres: entry.genres ? entry.genres.split(",").map((g) => g.trim()).filter(Boolean) : [],
      seasonYear: entry.seasonYear,
      episodes: entry.episodes,
      format: entry.format,
    },
  };
}
