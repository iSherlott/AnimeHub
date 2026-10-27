import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { UserAvatar } from "@/components/UserAvatar";
import { Pager } from "@/components/community/CommunityParts";
import { ContentActions, PollBox, ReplyForm, SpoilerText } from "@/components/community/CommunityClient";
import { ModerationButtons, ReportButton } from "@/components/community/CommunityPanels";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { blockedUserIdSet } from "@/lib/blocks";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/relativeTime";
import { isMember, listReplies, loadTopic, REPLIES_PAGE } from "@/lib/community";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string; topicId: string }>; searchParams: Promise<{ pagina?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadTopic((await params).topicId);
  return { title: loaded ? `${loaded.topic.title} · Comunidade ${loaded.scope.root.titleRomaji} · Anime Hub` : "Comunidade · Anime Hub" };
}

/** Um tópico da comunidade: a mensagem, a enquete (se houver) e as respostas, da mais antiga à mais nova. */
export default async function TopicPage({ params, searchParams }: Props) {
  const { key, topicId } = await params;
  const loaded = await loadTopic(topicId);
  if (!loaded) notFound();
  const { topic, scope } = loaded;
  if (scope.key !== key) permanentRedirect(`/comunidades/${scope.key}/topicos/${topicId}`);

  const user = await getCurrentUser();
  if ((await blockedUserIdSet(user?.id ?? null)).has(topic.authorId)) notFound();
  const member = await isMember(topic.communityId, user?.id ?? null);
  const canModerate = Boolean(user && can(user.role, "moderation"));

  // `pagina=ultima` (depois de responder) vai para a última página, onde a resposta nova aparece.
  const rawPage = (await searchParams).pagina;
  const first = await listReplies(topicId, 0, user?.id ?? null);
  const pages = Math.max(1, Math.ceil(first.total / REPLIES_PAGE));
  const page = rawPage === "ultima" ? pages : Math.min(pages, Math.max(1, Number(rawPage) || 1));
  const { rows: replies } = page === 1 ? first : await listReplies(topicId, page - 1, user?.id ?? null);

  const myVote = topic.poll && user ? ((await prisma.communityPollVote.findUnique({ where: { pollId_userId: { pollId: topic.poll.id, userId: user.id } }, select: { optionId: true } }))?.optionId ?? null) : null;
  const now = new Date();
  const communityHref = `/comunidades/${scope.key}`;
  const topicHref = `${communityHref}/topicos/${topicId}`;

  const locked = Boolean(topic.lockedAt);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        <AppLink href={`${communityHref}/forum`} underline="hover" color="inherit" data-testid="topic-back">
          ← Fórum
        </AppLink>
      </Typography>

      <Box component="article" data-testid="topic" sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {topic.pinnedAt && <Chip size="small" color="primary" label="Fixado" />}
          {locked && <Chip size="small" label="Trancado" data-testid="topic-locked" />}
        </Box>
        <Typography component="h2" sx={{ fontSize: { xs: 24, md: 28 }, lineHeight: 1.25, overflowWrap: "anywhere" }} data-testid="topic-title">
          {topic.title}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <UserAvatar id={topic.author.id} displayName={topic.author.displayName} avatarUrl={topic.author.avatarUrl} size={28} />
          <AppLink href={`/users/${topic.author.id}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            {topic.author.displayName}
          </AppLink>
          <Typography suppressHydrationWarning sx={{ fontSize: 13, color: "text.secondary" }}>
            {formatRelativeTime(topic.createdAt.toISOString(), now)}
            {topic.editedAt ? " · editado" : ""}
          </Typography>
          {topic.catalogEntry && <Chip size="small" label={`Sobre: ${topic.catalogEntry.titleNative ?? topic.catalogEntry.titleRomaji}`} data-testid="topic-about" />}
        </Box>
        <SpoilerText text={topic.body} isSpoiler={topic.isSpoiler} testId="topic-body" />
        {topic.poll && <PollBox topicId={topic.id} options={topic.poll.options.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes }))} myVote={myVote} canVote={member && !locked} />}
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
          <ContentActions kind="topic" id={topic.id} canEdit={user?.id === topic.authorId} canDelete={user?.id === topic.authorId || canModerate} initial={{ title: topic.title, body: topic.body }} afterDeleteHref={`${communityHref}/forum`} />
          {user && user.id !== topic.authorId && <ReportButton topicId={topic.id} />}
        </Box>
        {canModerate && <ModerationButtons topicId={topic.id} pinned={Boolean(topic.pinnedAt)} locked={locked} />}
      </Box>

      <Box component="section" aria-labelledby="respostas-heading" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography id="respostas-heading" component="h2" sx={{ fontSize: 20 }} data-testid="replies-count">
          {first.total} {first.total === 1 ? "resposta" : "respostas"}
        </Typography>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="replies">
          {replies.map((r) => (
            <Box component="li" key={r.id} id={`resposta-${r.id}`} data-testid={`reply-${r.id}`} sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, borderRadius: "10px", bgcolor: "background.paper", border: 1, borderColor: "divider", scrollMarginTop: 120 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <UserAvatar id={r.author.id} displayName={r.author.displayName} avatarUrl={r.author.avatarUrl} size={24} />
                <AppLink href={`/users/${r.author.id}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
                  {r.author.displayName}
                </AppLink>
                <Typography suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary" }}>
                  {formatRelativeTime(r.createdAt.toISOString(), now)}
                  {r.editedAt ? " · editada" : ""}
                </Typography>
              </Box>
              <SpoilerText text={r.body} isSpoiler={r.isSpoiler} testId={`reply-body-${r.id}`} />
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
                <ContentActions kind="reply" id={r.id} canEdit={user?.id === r.authorId} canDelete={user?.id === r.authorId || canModerate} initial={{ body: r.body }} />
                {user && user.id !== r.authorId && <ReportButton replyId={r.id} />}
              </Box>
            </Box>
          ))}
        </Box>
        <Pager basePath={topicHref} page={page} pages={pages} />
      </Box>

      {locked ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="topic-locked-note">
          Tópico trancado pela moderação: não aceita novas respostas.
        </Typography>
      ) : member ? (
        <ReplyForm topicId={topic.id} topicHref={topicHref} />
      ) : (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="reply-join-hint">
          Participe da comunidade (botão na coluna da esquerda) para responder.
        </Typography>
      )}
    </Box>
  );
}
