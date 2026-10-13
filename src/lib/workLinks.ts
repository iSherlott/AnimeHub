import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Ligações de continuação decididas pelo admin (Admin → Match name). Uma ligação confirmada junta a franquia da obra
 * nova à da anterior: daí em diante as telas que já agrupam temporadas pela franquia (página da obra, lista, perfil,
 * avisos de continuação) tratam as duas como uma só obra, sem lógica nova.
 */

type UndoSnapshot = {
  franchise: { rootAnilistId: number; name: string };
  members: Array<{ anilistId: number; seasonNumber: number }>;
};

type LinkRow = { id: string; earlierAnilistId: number; laterAnilistId: number; undoJson: string | null };

function parseSnapshot(json: string | null): UndoSnapshot | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as UndoSnapshot;
    return parsed?.franchise && Array.isArray(parsed.members) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Põe a franquia da obra nova dentro da franquia da anterior. As temporadas que vieram com a obra nova passam a contar
 * depois da última da anterior. Devolve `false` quando uma das duas ainda não tem produção (nada a juntar por enquanto).
 */
export async function mergeLinkedFranchises(link: LinkRow, db: PrismaClient = prisma): Promise<boolean> {
  const [earlier, later] = await Promise.all([
    db.production.findUnique({ where: { anilistId: link.earlierAnilistId }, select: { franchiseId: true } }),
    db.production.findUnique({ where: { anilistId: link.laterAnilistId }, select: { franchiseId: true } }),
  ]);
  if (!earlier || !later) return false;
  if (earlier.franchiseId === later.franchiseId) return true;

  await db.$transaction(async (tx) => {
    const [target, moving, laterFranchise] = await Promise.all([
      tx.production.aggregate({ where: { franchiseId: earlier.franchiseId }, _max: { seasonNumber: true } }),
      tx.production.findMany({ where: { franchiseId: later.franchiseId }, select: { id: true, anilistId: true, seasonNumber: true } }),
      tx.franchise.findUnique({ where: { id: later.franchiseId }, select: { rootAnilistId: true, name: true } }),
    ]);
    const offset = target._max.seasonNumber ?? 1;
    if (!link.undoJson && laterFranchise) {
      const snapshot: UndoSnapshot = { franchise: laterFranchise, members: moving.map((m) => ({ anilistId: m.anilistId, seasonNumber: m.seasonNumber })) };
      await tx.workLink.update({ where: { id: link.id }, data: { undoJson: JSON.stringify(snapshot) } });
    }
    for (const member of moving) {
      await tx.production.update({ where: { id: member.id }, data: { franchiseId: earlier.franchiseId, seasonNumber: member.seasonNumber + offset } });
    }
    // A franquia que ficou vazia não serve mais para nada (a raiz dela é única).
    await tx.franchise.deleteMany({ where: { id: later.franchiseId, productions: { none: {} } } });
  });
  return true;
}

/**
 * Depois que uma produção é criada ou atualizada pela AniList (que reconstrói a franquia pelas relações dela), reaplica as
 * ligações confirmadas que envolvem a obra, para a decisão do admin não se perder. Nunca derruba quem chamou.
 */
export async function reapplyLinksFor(anilistId: number, db: PrismaClient = prisma): Promise<void> {
  try {
    const links = await db.workLink.findMany({
      where: { status: "CONFIRMED", OR: [{ earlierAnilistId: anilistId }, { laterAnilistId: anilistId }] },
      orderBy: { createdAt: "asc" },
    });
    for (const link of links) await mergeLinkedFranchises(link, db);
  } catch (error) {
    console.error("[work-link] reaplicar falhou:", error);
  }
}

/** Desfaz uma decisão: a ligação confirmada separa de novo as franquias; uma recusa apenas deixa a sugestão voltar. */
export async function undoWorkLink(id: string): Promise<boolean> {
  const link = await prisma.workLink.findUnique({ where: { id } });
  if (!link) return false;
  const snapshot = link.status === "CONFIRMED" ? parseSnapshot(link.undoJson) : null;
  await prisma.$transaction(async (tx) => {
    if (snapshot) {
      const franchise = await tx.franchise.upsert({
        where: { rootAnilistId: snapshot.franchise.rootAnilistId },
        create: { rootAnilistId: snapshot.franchise.rootAnilistId, name: snapshot.franchise.name },
        update: {},
      });
      for (const member of snapshot.members) {
        await tx.production.updateMany({ where: { anilistId: member.anilistId }, data: { franchiseId: franchise.id, seasonNumber: member.seasonNumber } });
      }
    }
    await tx.workLink.delete({ where: { id } });
  });
  return true;
}
