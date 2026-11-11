import { prisma } from "@/lib/prisma";

/**
 * "Vem aí" (12/11/2026): quando entra no catálogo uma continuação, filme ou especial de uma obra que a pessoa tem na
 * lista — anunciada (ainda sem estreia) ou que acabou de estrear —, chega um aviso no sino, uma vez por obra.
 *
 * Diferente de src/lib/continuation.ts, que age quando a continuação começa a passar (põe na lista e avisa "voltou a
 * sair episódios"): aqui é o anúncio. A ligação vem das relações da AniList guardadas na obra nova: PREQUEL (é a
 * continuação de…) ou PARENT (é filme/especial de…). Só obras ainda por estrear ou que estrearam há pouco: a carga de
 * obras antigas não vira uma enxurrada de avisos.
 */
const RELATIONS = new Set(["PREQUEL", "PARENT"]);
const RECENT_START_DAYS = 60;
const MAX_PER_SCAN = 10;
/** O sino é consultado a cada minuto; a varredura de cada pessoa roda no máximo uma vez a cada tanto. */
const SCAN_GAP_MS = Number.isFinite(Number(process.env.WORK_ANNOUNCEMENT_SCAN_GAP_MS)) && process.env.WORK_ANNOUNCEMENT_SCAN_GAP_MS !== undefined && process.env.WORK_ANNOUNCEMENT_SCAN_GAP_MS !== "" ? Number(process.env.WORK_ANNOUNCEMENT_SCAN_GAP_MS) : 30 * 60 * 1000;
const lastScan = new Map<string, number>();

/** As obras de quem a nova é continuação ou especial (relações da AniList: [{id, relationType}]). */
export function announcedFrom(relationsJson: string | null): number[] {
  if (!relationsJson) return [];
  try {
    const parsed = JSON.parse(relationsJson) as Array<{ id?: unknown; relationType?: unknown }>;
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r?.relationType === "string" && RELATIONS.has(r.relationType) && Number.isInteger(r.id)).map((r) => r.id as number) : [];
  } catch {
    return [];
  }
}

export async function ensureWorkAnnouncements(userId: string, now: Date = new Date()): Promise<number> {
  const previous = lastScan.get(userId) ?? 0;
  if (SCAN_GAP_MS > 0 && now.getTime() - previous < SCAN_GAP_MS) return 0;
  lastScan.set(userId, now.getTime());
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { notifyAnnouncements: true } });
    if (!user?.notifyAnnouncements) return 0;
    const list = await prisma.anime.findMany({ where: { userId, anilistId: { not: null } }, select: { anilistId: true } });
    const mine = new Set(list.map((a) => a.anilistId as number));
    if (mine.size === 0) return 0;
    const since = new Date(now.getTime() - RECENT_START_DAYS * 86400_000);
    const candidates = await prisma.catalogEntry.findMany({
      where: {
        onPlatform: true,
        anilistId: { not: null, notIn: [...mine] },
        relationsJson: { not: null },
        status: { in: ["NOT_YET_RELEASED", "RELEASING"] },
        OR: [{ startDate: null }, { startDate: { gte: since } }],
      },
      select: { anilistId: true, relationsJson: true },
    });
    const hits = candidates
      .map((c) => ({ key: String(c.anilistId), related: announcedFrom(c.relationsJson).find((id) => mine.has(id)) }))
      .filter((h): h is { key: string; related: number } => h.related !== undefined);
    if (hits.length === 0) return 0;
    const already = new Set(
      (await prisma.socialNotification.findMany({ where: { userId, type: "WORK_ANNOUNCED", workKey: { in: hits.map((h) => h.key) } }, select: { workKey: true } })).map((n) => n.workKey)
    );
    const fresh = hits.filter((h) => !already.has(h.key)).slice(0, MAX_PER_SCAN);
    if (fresh.length === 0) return 0;
    // Aviso do sistema: a própria pessoa como "autor" (como o lembrete dos eventos).
    await prisma.socialNotification.createMany({ data: fresh.map((h) => ({ userId, actorId: userId, type: "WORK_ANNOUNCED", workKey: h.key, relatedWorkKey: String(h.related), createdAt: now })) });
    return fresh.length;
  } catch (error) {
    console.error("[workAnnouncements] falhou:", error);
    return 0;
  }
}

/** Título de cada obra pela chave (AniList ID), só as que estão na plataforma. */
export async function workTitlesByKey(keys: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set(keys.filter((k): k is string => Boolean(k) && /^\d+$/.test(k as string)).map(Number))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.catalogEntry.findMany({ where: { anilistId: { in: ids }, onPlatform: true }, select: { anilistId: true, titleRomaji: true } });
  return new Map(rows.map((r) => [String(r.anilistId), r.titleRomaji]));
}
