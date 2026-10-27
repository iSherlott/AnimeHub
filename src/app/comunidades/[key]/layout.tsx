import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import { PageContainer } from "@/components/PageShell";
import { SideBox } from "@/components/SideBox";
import { UserAvatar } from "@/components/UserAvatar";
import { JoinButton } from "@/components/community/CommunityClient";
import { CommunityMenu } from "@/components/community/CommunityPanels";
import { listMembers, markVisit, relatedCommunities } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { getCommunity, getScope, getViewer } from "./data";

/**
 * A comunidade do anime em três colunas: à esquerda a capa, o nome, "Participar" e o menu; no centro a seção aberta;
 * à direita a grade de membros e as comunidades relacionadas.
 */
export default async function CommunityLayout({ children, params }: { children: ReactNode; params: Promise<{ key: string }> }) {
  const { key } = await params;
  const scope = await getScope(key);
  if (!scope) notFound();
  const [community, { user, member }] = await Promise.all([getCommunity(key), getViewer(key)]);
  if (community && member && user) await markVisit(community.id, user.id);
  const [topics, polls, events, membersSample, related] = await Promise.all([
    community ? prisma.communityTopic.count({ where: { communityId: community.id, deletedAt: null } }) : 0,
    community ? prisma.communityTopic.count({ where: { communityId: community.id, deletedAt: null, poll: { isNot: null } } }) : 0,
    community ? prisma.communityEvent.count({ where: { communityId: community.id, deletedAt: null } }) : 0,
    community ? listMembers(community.id, 0, 9) : Promise.resolve({ total: 0, rows: [] }),
    relatedCommunities(scope),
  ]);
  const { root } = scope;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "220px minmax(0,1fr)", lg: "220px minmax(0,1fr) 280px" }, gap: 3, alignItems: "start" }}>
          {/* Coluna da esquerda: a comunidade */}
          <Box component="aside" aria-label="A comunidade" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="community-header">
            {/* No celular a capa fica pequena, ao lado do nome, para o conteúdo da seção aparecer logo. */}
            <Box sx={{ display: "flex", flexDirection: { xs: "row", md: "column" }, alignItems: { xs: "center", md: "stretch" }, gap: 1.5 }}>
              <Box sx={{ position: "relative", width: { xs: 64, md: "100%" }, flexShrink: 0, aspectRatio: "2 / 3", borderRadius: { xs: "8px", md: "12px" }, overflow: "hidden", bgcolor: "#171820" }}>
                {root.coverImage && <CoverImage src={root.coverImage} sizes="(max-width: 900px) 64px, 220px" />}
              </Box>
              <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
                <Typography component="p" lang="ja" sx={{ color: "primary.main", fontSize: 11, fontWeight: 700 }}>
                  コミュニティ / COMUNIDADE
                </Typography>
                <Typography component="h1" sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }} data-testid="community-name">
                  <AnimeTitle titles={{ titleRomaji: root.titleRomaji, titleEnglish: root.titleEnglish, titleNative: root.titleNative }} />
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 13, fontVariantNumeric: "tabular-nums" }} data-testid="community-stats">
                  {membersSample.total} {membersSample.total === 1 ? "membro" : "membros"} · {topics} {topics === 1 ? "tópico" : "tópicos"} · {scope.works.length} {scope.works.length === 1 ? "obra" : "obras"} da franquia
                </Typography>
              </Box>
            </Box>
            <JoinButton communityKey={scope.key} member={member} loggedIn={Boolean(user)} />
            <CommunityMenu communityKey={scope.key} counts={{ topics, polls, events, members: membersSample.total }} />
            <AppLink href={`/anime/${root.workKey}`} underline="hover" sx={{ fontSize: 13, color: "text.secondary" }}>
              Página do anime
            </AppLink>
          </Box>

          {/* Centro: a seção aberta */}
          <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>{children}</Box>

          {/* Coluna da direita: membros e comunidades relacionadas */}
          <Box component="aside" aria-label="Membros e comunidades relacionadas" sx={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: { md: "1 / -1", lg: "auto" } }}>
            <SideBox title="membros" count={membersSample.total} more={membersSample.total > 9 ? { href: `/comunidades/${scope.key}/membros`, label: "ver todos" } : undefined} testId="community-members-box">
              {membersSample.rows.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Ainda sem membros. Seja a primeira pessoa a participar.</Typography>
              ) : (
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 1 }}>
                  {membersSample.rows.map((m) => (
                    <Box component="li" key={m.id}>
                      <AppLink href={`/users/${m.id}`} underline="hover" sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, color: "text.primary", fontSize: 11, textAlign: "center", overflowWrap: "anywhere" }}>
                        <UserAvatar id={m.id} displayName={m.displayName} avatarUrl={m.avatarUrl} size={48} />
                        {m.displayName}
                      </AppLink>
                    </Box>
                  ))}
                </Box>
              )}
            </SideBox>
            {related.length > 0 && (
              <SideBox title="comunidades relacionadas" count={related.length} testId="community-related">
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 1 }}>
                  {related.map((c) => (
                    <Box component="li" key={c.key}>
                      <AppLink href={`/comunidades/${c.key}`} underline="hover" sx={{ display: "flex", flexDirection: "column", gap: 0.5, color: "text.primary", fontSize: 11, overflowWrap: "anywhere" }}>
                        <Box sx={{ position: "relative", width: "100%", aspectRatio: "2 / 3", borderRadius: "6px", overflow: "hidden", bgcolor: "#171820" }}>{c.coverImage && <CoverImage src={c.coverImage} sizes="80px" />}</Box>
                        <AnimeTitle titles={{ titleRomaji: c.titleRomaji, titleEnglish: c.titleEnglish, titleNative: c.titleNative }} />
                        <Typography component="span" sx={{ fontSize: 10, color: "text.secondary" }}>
                          ({c.members})
                        </Typography>
                      </AppLink>
                    </Box>
                  ))}
                </Box>
              </SideBox>
            )}
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}
