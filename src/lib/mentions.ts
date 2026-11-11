import { prisma } from "@/lib/prisma";
import { stripSpoilers } from "@/lib/spoilers";
import { extractMentions } from "@/lib/mentionText";
import { notifySocial } from "@/lib/socialNotifications";

/**
 * Avisa quem foi mencionado com @ (12/11/2026). O @ de dentro de um trecho de spoiler (`||…||`) não conta: o aviso não
 * pode puxar a pessoa para um texto escondido. Respeita bloqueio e a preferência "Menções" (notifySocial). `skip` = quem
 * já recebe outro aviso pela mesma ação (o dono da publicação avisado da resposta não ganha um segundo aviso).
 */
export async function notifyMentions(input: { actorId: string; text: string; postId: string; commentId?: string | null; skip?: Array<string | null | undefined> }): Promise<number> {
  const handles = extractMentions(stripSpoilers(input.text));
  if (handles.length === 0) return 0;
  const people = await prisma.user.findMany({ where: { handle: { in: handles } }, select: { id: true } });
  const skip = new Set(input.skip?.filter(Boolean) as string[] | undefined);
  let sent = 0;
  for (const person of people) {
    if (person.id === input.actorId || skip.has(person.id)) continue;
    await notifySocial({ type: "MENTION", recipientId: person.id, actorId: input.actorId, postId: input.postId, commentId: input.commentId ?? null });
    sent += 1;
  }
  return sent;
}
