import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { blockedUserIdSet } from "@/lib/blocks";

/**
 * Lista os alertas de "favorito no ar agora" (Epic 10) — só leitura, quem
 * escreve é o services/notifier a cada ~2min. `airingAt`/`seenAt` vão como
 * ISO/epoch crus, sem formatação de "faltam X minutos" no servidor — o
 * cliente calcula com o próprio relógio, mesmo princípio já usado no
 * calendário (evita divergência de fuso servidor/navegador).
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const alerts = await prisma.airingAlert.findMany({
    where: { userId: user.id },
    orderBy: { airingAt: "desc" },
  });

  const anilistIds = [...new Set(alerts.map((a) => a.anilistId))];
  const animeByAnilistId = new Map(
    (
      await prisma.anime.findMany({
        where: { userId: user.id, anilistId: { in: anilistIds } },
        select: {
          id: true,
          anilistId: true,
          titleRomaji: true,
          titleEnglish: true,
          titleNative: true,
          titlePortuguese: true,
          coverImage: true,
        },
      })
    ).map((a) => [a.anilistId, a])
  );

  const results = alerts.map((alert) => {
    const anime = animeByAnilistId.get(alert.anilistId);
    return {
      id: alert.id,
      anilistId: alert.anilistId,
      episode: alert.episode,
      airingAt: alert.airingAt.toISOString(),
      seenAt: alert.seenAt ? alert.seenAt.toISOString() : null,
      // "Data alterada": horário anterior do episódio (null = lançamento normal).
      previousAiringAt: alert.previousAiringAt ? alert.previousAiringAt.toISOString() : null,
      // "EPISODE" (lançamento / data alterada) | "RETURN" (voltou a sair episódios).
      kind: alert.kind,
      animeId: anime?.id ?? null,
      titleRomaji: anime?.titleRomaji ?? null,
      titleEnglish: anime?.titleEnglish ?? null,
      titleNative: anime?.titleNative ?? null,
      titlePortuguese: anime?.titlePortuguese ?? null,
      coverImage: anime?.coverImage ?? null,
    };
  });

  // Canal Social: só quem/onde (nunca o texto). Quem hoje tem bloqueio
  // comigo some; publicação apagada vira tombstone ("indisponível").
  const blocked = await blockedUserIdSet(user.id);
  const socialRows = await prisma.socialNotification.findMany({
    where: { userId: user.id, ...(blocked.size ? { actorId: { notIn: [...blocked] } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { id: true, displayName: true } } },
  });
  const postIds = [...new Set(socialRows.map((n) => n.postId).filter((p): p is string => Boolean(p)))];
  const livePosts = new Set(
    postIds.length
      ? (await prisma.post.findMany({ where: { id: { in: postIds }, deletedAt: null }, select: { id: true } })).map((p) => p.id)
      : []
  );
  const social = socialRows.map((n) => {
    const unavailable = n.postId ? !livePosts.has(n.postId) : false;
    let href: string | null = null;
    if (n.type === "NEW_FOLLOWER") href = `/users/${n.actor.id}`;
    else if (n.postId && !unavailable) href = `/publicacao/${n.postId}${n.commentId ? `#comentario-${n.commentId}` : ""}`;
    return {
      id: n.id,
      type: n.type,
      actor: n.actor,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
      unavailable,
      href,
    };
  });

  return NextResponse.json({
    alerts: results,
    unseenCount: results.filter((r) => !r.seenAt).length,
    social,
    socialUnreadCount: social.filter((n) => !n.readAt).length,
  });
}
