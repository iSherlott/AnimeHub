import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { blockedUserIdSet } from "@/lib/blocks";
import { isAlertVisible } from "@/lib/alertVisibility";
import { resolveTimeZone } from "@/lib/timeZone";
import { communityLabels } from "@/lib/community";
import { ensureBirthdayNotifications } from "@/lib/birthdays";
import { ensureSystemAlerts, systemAlertsFor } from "@/lib/systemAlerts";
import { ensureEventReminders } from "@/lib/animeEvents";
import { ensureWorkAnnouncements, workTitlesByKey } from "@/lib/workAnnouncements";

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

  const [allAlerts, zoneRow] = await Promise.all([
    prisma.airingAlert.findMany({ where: { userId: user.id }, orderBy: { airingAt: "desc" } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { timeZone: true } }),
  ]);
  // Lançamento comum só vale no dia dele (o episódio de amanhã fica escondido até o dia chegar); ver isAlertVisible.
  const now = new Date();
  const zone = resolveTimeZone(zoneRow?.timeZone);
  const alerts = allAlerts.filter((a) => isAlertVisible(a, now, zone));

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
  // Aniversários dos amigos: o aviso do dia nasce quando o sino é consultado (um por amigo por dia).
  await ensureBirthdayNotifications(user.id, zone, now);
  // Lembrete do dia dos eventos da agenda em que a pessoa marcou "vou".
  await ensureEventReminders(user.id, zone, now);
  // Continuação, filme ou especial anunciado de uma obra da lista (no máximo uma varredura a cada tanto, por pessoa).
  await ensureWorkAnnouncements(user.id, now);
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
  // Comunidades: o tópico (título, comunidade) e o evento; apagado vira "removido".
  const topicIds = [...new Set(socialRows.map((n) => n.topicId).filter((t): t is string => Boolean(t)))];
  const eventIds = [...new Set(socialRows.map((n) => n.eventId).filter((e): e is string => Boolean(e)))];
  const animeEventIds = [...new Set(socialRows.map((n) => n.animeEventId).filter((e): e is string => Boolean(e)))];
  const animeEventById = new Map(
    (animeEventIds.length ? await prisma.animeEvent.findMany({ where: { id: { in: animeEventIds }, deletedAt: null }, select: { id: true, title: true } }) : []).map((e) => [e.id, e])
  );
  const [topics, events] = await Promise.all([
    topicIds.length ? prisma.communityTopic.findMany({ where: { id: { in: topicIds }, deletedAt: null }, select: { id: true, title: true, communityId: true } }) : [],
    eventIds.length ? prisma.communityEvent.findMany({ where: { id: { in: eventIds }, deletedAt: null }, select: { id: true, title: true, communityId: true } }) : [],
  ]);
  // Recomendações de obras dos amigos: o título da obra e o link para ela.
  const recommendationIds = [...new Set(socialRows.map((n) => n.recommendationId).filter((r): r is string => Boolean(r)))];
  const recommendationById = new Map(
    (recommendationIds.length ? await prisma.workRecommendation.findMany({ where: { id: { in: recommendationIds } }, select: { id: true, workKey: true, titleRomaji: true } }) : []).map((r) => [r.id, r])
  );
  // Anúncios de obras (WORK_ANNOUNCED): o título da obra nova e o da obra da lista.
  const announcedTitles = await workTitlesByKey(socialRows.flatMap((n) => [n.workKey, n.relatedWorkKey]));
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const labels = await communityLabels([...topics, ...events].map((x) => x.communityId));
  const social = socialRows.map((n) => {
    const topic = n.topicId ? topicById.get(n.topicId) : undefined;
    const event = n.eventId ? eventById.get(n.eventId) : undefined;
    const label = labels.get(topic?.communityId ?? event?.communityId ?? "");
    const recommendation = n.recommendationId ? recommendationById.get(n.recommendationId) : undefined;
    const animeEvent = n.animeEventId ? animeEventById.get(n.animeEventId) : undefined;
    const unavailable = n.postId ? !livePosts.has(n.postId) : n.topicId ? !topic || !label : n.eventId ? !event || !label : n.type === "WORK_RECOMMENDATION" ? !recommendation : n.type === "EVENT_REMINDER" ? !animeEvent : n.type === "WORK_ANNOUNCED" ? !(n.workKey && announcedTitles.has(n.workKey)) : false;
    let href: string | null = null;
    if (n.type === "NEW_FOLLOWER" || n.type === "PROFILE_FAN" || n.type === "FRIEND_ACCEPTED") href = `/users/${n.actor.id}`;
    else if (n.type === "FRIEND_REQUEST") href = "/amigos";
    // O bilhete fica em Amigos → Recomendações dos amigos (o sino nunca mostra o texto).
    else if (n.type === "WORK_RECOMMENDATION") href = recommendation ? "/amigos#recomendacoes" : null;
    else if (n.type === "EVENT_REMINDER") href = animeEvent ? `/eventos#evento-${animeEvent.id}` : null;
    else if (n.type === "WORK_ANNOUNCED") href = n.workKey && announcedTitles.has(n.workKey) ? `/anime/${n.workKey}` : null;
    else if (n.type === "FRIEND_BIRTHDAY") href = `/users/${n.actor.id}#recados`;
    // Recado e depoimento ficam no perfil de quem recebe (quem está vendo o sino).
    else if (n.type === "PROFILE_SCRAP") href = `/users/${user.id}#recados`;
    else if (n.type === "PROFILE_TESTIMONIAL") href = `/users/${user.id}#depoimentos`;
    // A resposta mais recente está na última página do tópico.
    else if (topic && label) href = `/comunidades/${label.key}/topicos/${topic.id}?pagina=ultima${n.replyId ? `#resposta-${n.replyId}` : ""}`;
    else if (event && label) href = `/comunidades/${label.key}/eventos#evento-${event.id}`;
    else if (n.postId && !unavailable) href = `/publicacao/${n.postId}${n.commentId ? `#comentario-${n.commentId}` : ""}`;
    return {
      id: n.id,
      type: n.type,
      actor: n.actor,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
      unavailable,
      href,
      community: label?.title ?? null,
      subject: topic?.title ?? event?.title ?? recommendation?.titleRomaji ?? animeEvent?.title ?? (n.workKey ? (announcedTitles.get(n.workKey) ?? null) : null),
      inComment: n.type === "MENTION" ? Boolean(n.commentId) : undefined,
      related: n.relatedWorkKey ? (announcedTitles.get(n.relatedWorkKey) ?? null) : null,
    };
  });

  // Administração: serviços e jobs que falharam ou pararam (aba Sistema do sino).
  let system: Awaited<ReturnType<typeof systemAlertsFor>> = [];
  if (user.role === "ADMIN") {
    await ensureSystemAlerts(now);
    system = await systemAlertsFor(user.id);
  }

  return NextResponse.json({
    alerts: results,
    unseenCount: results.filter((r) => !r.seenAt).length,
    social,
    socialUnreadCount: social.filter((n) => !n.readAt).length,
    ...(user.role === "ADMIN" ? { system, systemUnreadCount: system.filter((n) => !n.readAt).length } : {}),
  });
}
