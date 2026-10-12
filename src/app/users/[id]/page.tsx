import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ProfileTabs } from "@/components/ProfileTabs";
import { AppLink } from "@/components/AppLink";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer, PageIntro, SectionTitle, TwoColumn } from "@/components/PageShell";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { blockRelation } from "@/lib/blocks";
import { BlockedProfileNotice } from "@/components/BlockedProfileNotice";
import { equippedTitleNames } from "@/lib/quiz";

type Params = { params: Promise<{ id: string }> };

/** Cartão lateral do Figma ("Seção de especificação"): surface, raio 16, respiro de 24. */
function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", borderRadius: "16px", p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </Box>
  );
}

export default async function UserProfilePage({ params }: Params) {
  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, handle: true, avatarUrl: true, bannerUrl: true, bio: true },
  });
  if (!target) notFound();

  const viewer = await getCurrentUser();

  // Bloqueio (Figma 13:43571): sem bio, posts nem listas por trás do bloqueio.
  // Quem foi bloqueado recebe a mesma mensagem neutra de "indisponível"
  // (404), sem revelar quem bloqueou quem nem por quê.
  const relation = await blockRelation(viewer?.id ?? null, id);
  if (relation === "blocked-me") notFound();
  if (relation === "blocked-by-me") {
    return (
      <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
        <Header />
        <PageContainer>
          <BlockedProfileNotice userId={id} displayName={target.displayName} />
        </PageContainer>
      </Box>
    );
  }

  const [followerCount, followingCount, postCount, isFollowedByMe, titleCount, equippedTitles] = await Promise.all([
    prisma.follow.count({ where: { followingId: id } }),
    prisma.follow.count({ where: { followerId: id } }),
    prisma.post.count({ where: { userId: id, deletedAt: null } }),
    viewer
      ? prisma.follow
          .findUnique({ where: { followerId_followingId: { followerId: viewer.id, followingId: id } } })
          .then((f) => f !== null)
      : Promise.resolve(false),
    prisma.userTitle.count({ where: { userId: id } }),
    equippedTitleNames([id]),
  ]);

  const isOwnProfile = viewer?.id === id;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="会話 / COMUNIDADE"
          title={isOwnProfile ? "Meu perfil" : target.displayName}
          subtitle={
            isOwnProfile
              ? "Seu espaço público de conversas. Sua organização pessoal continua privada."
              : target.handle
                ? `@${target.handle}`
                : "Perfil público"
          }
        />
        <AppLink href="/" underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Comunidade / Para você
        </AppLink>
        <TwoColumn
          main={
            <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <ProfileHeader
                userId={id}
                displayName={target.displayName}
                handle={target.handle}
                avatarUrl={target.avatarUrl}
                bannerUrl={target.bannerUrl}
                bio={target.bio}
                postCount={postCount}
                initialFollowerCount={followerCount}
                followingCount={followingCount}
                title={equippedTitles.get(id) ?? null}
                isOwnProfile={isOwnProfile}
                viewerLoggedIn={Boolean(viewer)}
                initialFollowing={isFollowedByMe}
              />
              <ProfileTabs userId={id} isOwnProfile={isOwnProfile} titleCount={titleCount} />
            </Box>
          }
          aside={
            isOwnProfile ? (
              <SideCard title="Só você vê">
                <Typography sx={{ fontSize: 14 }}>
                  Sua Minha Lista não aparece para outras pessoas. Publicar sobre uma obra não publica sua lista completa.
                </Typography>
                <Box>
                  <LinkButton href="/minha-lista" sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
                    🔒 Abrir Minha Lista privada
                  </LinkButton>
                </Box>
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                  Editar perfil altera nome, identificador e bio; não edita publicações na V1.
                </Typography>
              </SideCard>
            ) : (
              <>
                <SideCard title="Perfil público">
                  <Typography sx={{ fontSize: 14 }}>
                    Você vê apenas publicações e discussões públicas desta pessoa. A lista de animes acompanhados não é pública por padrão.
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                    Seguir perfil mostra suas conversas em Seguindo. Para organizar lançamentos, use Acompanhar no detalhe do anime.
                  </Typography>
                </SideCard>
                <SideCard title="Segurança">
                  <Typography sx={{ fontSize: 14 }}>
                    Denunciar perfil ou bloquear pelo menu. Confirmar antes de bloquear. Perfil indisponível usa mensagem neutra, sem
                    revelar motivos de moderação.
                  </Typography>
                </SideCard>
              </>
            )
          }
        />
      </PageContainer>
    </Box>
  );
}
