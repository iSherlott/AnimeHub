import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, SectionTitle, TwoColumn } from "@/components/PageShell";
import { CommunityHeader, Pager, TopicRow, workLabel } from "@/components/community/CommunityParts";
import { JoinButton, NewTopicForm } from "@/components/community/CommunityClient";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { findCommunity, isMember, listTopics, markVisit, scopeForKey, TOPICS_PAGE } from "@/lib/community";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ pagina?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const scope = await scopeForKey((await params).key);
  return { title: scope ? `Comunidade ${scope.root.titleRomaji} · Anime Hub` : "Comunidade · Anime Hub" };
}

/**
 * A comunidade do anime (estilo Orkut): o fórum da franquia inteira. Qualquer pessoa lê; quem entra na comunidade cria
 * tópicos, responde e vota nas enquetes. `key` pode ser qualquer obra da franquia: o endereço vira o da franquia.
 */
export default async function CommunityPage({ params, searchParams }: Props) {
  const { key } = await params;
  const scope = await scopeForKey(key);
  if (!scope) notFound();
  if (scope.key !== key) permanentRedirect(`/comunidades/${scope.key}`);
  const page = Math.max(1, Number((await searchParams).pagina) || 1);

  const user = await getCurrentUser();
  const community = await findCommunity(scope);
  const member = await isMember(community?.id ?? null, user?.id ?? null);
  if (community && member && user) await markVisit(community.id, user.id);
  const [members, { total, rows }] = community
    ? await Promise.all([prisma.communityMember.count({ where: { communityId: community.id } }), listTopics(community.id, page - 1, user?.id ?? null)])
    : [0, { total: 0, rows: [] }];
  const pages = Math.max(1, Math.ceil(total / TOPICS_PAGE));
  const now = new Date();
  const base = `/comunidades/${scope.key}`;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <CommunityHeader scope={scope} members={members} topics={total} action={<JoinButton communityKey={scope.key} member={member} loggedIn={Boolean(user)} />} />
        <TwoColumn
          main={
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {member ? (
                <NewTopicForm communityKey={scope.key} works={scope.works.map((w) => ({ id: w.id, label: workLabel(w) }))} />
              ) : (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="community-join-hint">
                  {user ? "Participe da comunidade para criar tópicos, responder e votar nas enquetes." : "Entre na sua conta e participe da comunidade para criar tópicos e responder."}
                </Typography>
              )}
              <Box component="section" aria-labelledby="topicos-heading" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <SectionTitle>
                  <span id="topicos-heading">Fórum</span>
                </SectionTitle>
                {rows.length === 0 ? (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="community-empty">
                    Nenhum tópico ainda. {member ? "Comece a conversa." : "Participe e comece a conversa."}
                  </Typography>
                ) : (
                  <Box component="ul" sx={{ m: 0, p: 0 }} data-testid="topic-list">
                    {rows.map((t) => (
                      <TopicRow key={t.id} topic={t} href={`${base}/topicos/${t.id}`} now={now} />
                    ))}
                  </Box>
                )}
                <Pager basePath={base} page={page} pages={pages} />
              </Box>
            </Box>
          }
          aside={
            <>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <SectionTitle>Obras da franquia</SectionTitle>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.5 }} data-testid="community-works">
                  {scope.works.map((w) => (
                    <li key={w.id}>
                      <AppLink href={`/anime/${w.anilistId ?? scope.root.workKey}`} underline="hover" sx={{ fontSize: 14 }}>
                        {workLabel(w)}
                      </AppLink>
                    </li>
                  ))}
                </Box>
              </Box>
              {user && (
                <AppLink href="/comunidades" underline="hover" sx={{ fontSize: 14 }} data-testid="my-communities-link">
                  Minhas comunidades
                </AppLink>
              )}
            </>
          }
        />
      </PageContainer>
    </Box>
  );
}
