import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Box, Chip, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { PageContainer } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Pager } from "@/components/community/CommunityParts";
import { ContentActions, JoinButton, PollBox, ReplyForm, SpoilerText } from "@/components/community/CommunityClient";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { blockedUserIdSet } from "@/lib/blocks";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/relativeTime";
import { isMember, listReplies, loadTopic, markVisit, REPLIES_PAGE } from "@/lib/community";

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
  if (member && user) await markVisit(topic.communityId, user.id);
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

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, maxWidth: 824 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            <AppLink href={communityHref} underline="hover" color="inherit" data-testid="topic-back">
              COMUNIDADE · <AnimeTitle titles={{ titleRomaji: scope.root.titleRomaji, titleEnglish: scope.root.titleEnglish, titleNative: scope.root.titleNative }} />
            </AppLink>
          </Typography>

          <Box component="article" data-testid="topic" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography component="h1" sx={{ fontSize: { xs: 26, md: 32 }, lineHeight: 1.25, overflowWrap: "anywhere" }} data-testid="topic-title">
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
            {topic.poll && <PollBox topicId={topic.id} options={topic.poll.options.map((o) => ({ id: o.id, label: o.label, votes: o._count.votes }))} myVote={myVote} canVote={member} />}
            <ContentActions kind="topic" id={topic.id} canEdit={user?.id === topic.authorId} canDelete={user?.id === topic.authorId || canModerate} initial={{ title: topic.title, body: topic.body }} afterDeleteHref={communityHref} />
          </Box>

          <Box component="section" aria-labelledby="respostas-heading" sx={{ display: "flex", flexDirection: "column", gap: 1.5, borderTop: 1, borderColor: "divider", pt: 3 }}>
            <Typography id="respostas-heading" component="h2" sx={{ fontSize: 20 }} data-testid="replies-count">
              {first.total} {first.total === 1 ? "resposta" : "respostas"}
            </Typography>
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="replies">
              {replies.map((r) => (
                <Box component="li" key={r.id} id={`resposta-${r.id}`} data-testid={`reply-${r.id}`} sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5, borderRadius: "10px", bgcolor: "background.paper", scrollMarginTop: 120 }}>
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
                  <ContentActions kind="reply" id={r.id} canEdit={user?.id === r.authorId} canDelete={user?.id === r.authorId || canModerate} initial={{ body: r.body }} />
                </Box>
              ))}
            </Box>
            <Pager basePath={topicHref} page={page} pages={pages} />
          </Box>

          {member ? (
            <ReplyForm topicId={topic.id} topicHref={topicHref} />
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-start" }} data-testid="reply-join-hint">
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Participe da comunidade para responder.</Typography>
              <JoinButton communityKey={scope.key} member={false} loggedIn={Boolean(user)} />
            </Box>
          )}
        </Box>
      </PageContainer>
    </Box>
  );
}
