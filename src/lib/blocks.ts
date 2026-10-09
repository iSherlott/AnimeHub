import { prisma } from "@/lib/prisma";

/**
 * Bloqueio de perfis (Figma `13:43571`, D-10 — recomendação): bidirecional
 * para visibilidade e interação. Quem bloqueia não vê o bloqueado; o
 * bloqueado também não vê nem interage com quem o bloqueou, e recebe a
 * mensagem neutra "Perfil indisponível", sem motivo.
 */

/** Ids com quem existe bloqueio em QUALQUER direção com o viewer. */
export async function blockedUserIdSet(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const row of rows) ids.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
  return ids;
}

export type BlockRelation = "none" | "blocked-by-me" | "blocked-me";

/** Estado entre o viewer e outra pessoa (a direção importa para a mensagem). */
export async function blockRelation(viewerId: string | null, otherId: string): Promise<BlockRelation> {
  if (!viewerId || viewerId === otherId) return "none";
  const rows = await prisma.block.findMany({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: otherId },
        { blockerId: otherId, blockedId: viewerId },
      ],
    },
    select: { blockerId: true },
  });
  if (rows.some((r) => r.blockerId === viewerId)) return "blocked-by-me";
  return rows.length > 0 ? "blocked-me" : "none";
}
