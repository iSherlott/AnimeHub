import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { PeopleGrid, ProfileSection } from "@/components/profile/ProfileSections";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { blockRelation } from "@/lib/blocks";
import { listFans } from "@/lib/profileOrkut";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** Quem é fã da pessoa (como no Orkut), dos mais recentes aos mais antigos. */
export default async function FansPage({ params }: Props) {
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { displayName: true } });
  if (!target) notFound();
  const viewer = await getCurrentUser();
  if ((await blockRelation(viewer?.id ?? null, id)) !== "none") notFound();
  const { total, rows } = await listFans(id, viewer?.id ?? null);
  const own = viewer?.id === id;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="プロフィール / FÃS" title={own ? "Meus fãs" : `Fãs de ${target.displayName}`} subtitle={`${total} ${total === 1 ? "fã" : "fãs"}`} />
        <AppLink href={`/users/${id}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← {own ? "Meu perfil" : `Perfil de ${target.displayName}`}
        </AppLink>
        <ProfileSection id="fas" title="fãs" count={total} testId="fans-page">
          {rows.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ainda ninguém.</Typography>
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
