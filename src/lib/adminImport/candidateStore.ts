import { prisma } from "@/lib/prisma";

/** Candidata da AniList guardada para o admin decidir (Admin → Match name). */
export type StoredCandidate = { anidbId: number; anilistId: number; candidateTitle: string; score: number; reason: string };

/**
 * Guarda as candidatas que o religamento não ligou sozinho. Uma por obra do AniDB; uma sugestão que o admin já recusou
 * não volta (só muda se a candidata for outra).
 */
export async function saveCandidates(items: StoredCandidate[]): Promise<void> {
  for (const item of items) {
    const existing = await prisma.anidbCandidate.findUnique({ where: { anidbId: item.anidbId }, select: { anilistId: true, status: true } });
    if (existing?.status === "REJECTED" && existing.anilistId === item.anilistId) continue;
    await prisma.anidbCandidate.upsert({
      where: { anidbId: item.anidbId },
      create: { ...item },
      update: { anilistId: item.anilistId, candidateTitle: item.candidateTitle, score: item.score, reason: item.reason, status: "PENDING", decidedByName: null },
    });
  }
}

/** A obra do AniDB foi ligada (ou sumiu): não há mais o que decidir. */
export async function clearCandidates(anidbIds: number[]): Promise<void> {
  if (anidbIds.length === 0) return;
  await prisma.anidbCandidate.deleteMany({ where: { anidbId: { in: anidbIds } } });
}
