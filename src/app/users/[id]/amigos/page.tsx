import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { PeopleGrid, ProfileSection } from "@/components/profile/ProfileSections";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { blockRelation } from "@/lib/blocks";
import { listFriends } from "@/lib/friends";

type Props = { params: Promise<{ id: string }> };

const FRIENDS_MAX = 300;

/** Todos os amigos do perfil (pedidos de amizade aceitos). */
export default async function FriendsPage({ params }: Props) {
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { displayName: true } });
  if (!target) notFound();
  const viewer = await getCurrentUser();
  if ((await blockRelation(viewer?.id ?? null, id)) !== "none") notFound();
  const { total, rows } = await listFriends(id, viewer?.id ?? null, FRIENDS_MAX);
  const own = viewer?.id === id;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="プロフィール / PERFIL" title={own ? "Meus amigos" : `Amigos de ${target.displayName}`} subtitle="Amizade é um pedido aceito pelas duas pessoas." />
        <AppLink href={`/users/${id}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← {own ? "Meu perfil" : `Perfil de ${target.displayName}`}
        </AppLink>
        <ProfileSection id="amigos" title="amigos" count={total} testId="friends-page">
          {rows.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ainda nenhum amigo.</Typography>
          ) : (
            <Box sx={{ maxWidth: 560 }}>
              <PeopleGrid people={rows} size={64} />
            </Box>
          )}
          {total > rows.length && <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Mostrando os {rows.length} mais recentes.</Typography>}
        </ProfileSection>
      </PageContainer>
    </Box>
  );
}
