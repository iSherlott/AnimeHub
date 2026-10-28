import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ScrapForm } from "@/components/profile/ProfileActions";
import { ProfileSection, ScrapList } from "@/components/profile/ProfileSections";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { scrapConversation } from "@/lib/profileSocial";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; otherId: string }> };

/**
 * A conversa por recados entre duas pessoas: os recados de uma no perfil da
 * outra, nos dois sentidos, do mais antigo ao mais novo. Se quem vê é uma das duas, escreve para a outra daqui mesmo.
 */
export default async function ScrapConversationPage({ params }: Props) {
  const { id, otherId } = await params;
  const viewer = await getCurrentUser();
  const conversation = await scrapConversation(id, otherId, viewer?.id ?? null);
  if (!conversation) notFound();
  const { a, b, scraps } = conversation;
  const names = new Map([
    [a.id, a.displayName],
    [b.id, b.displayName],
  ]);
  const partner = viewer?.id === a.id ? b : viewer?.id === b.id ? a : null;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="プロフィール / RECADOS" title={`${a.displayName} e ${b.displayName}`} subtitle="Os recados trocados entre as duas pessoas, do mais antigo ao mais novo." />
        <AppLink href={`/users/${a.id}#recados`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Recados de {a.displayName}
        </AppLink>
        <ProfileSection id="conversa" title="conversa" count={scraps.length} testId="scrap-conversation">
          <ScrapList scraps={scraps} viewerId={viewer?.id ?? null} canModerate={can(viewer?.role, "moderation")} empty="Nenhum recado trocado ainda." showProfile={names} />
          {partner ? (
            <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
              <ScrapForm userId={partner.id} label={`Recado para ${partner.displayName}`} />
            </Box>
          ) : (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Recados ficam à vista de quem tem conta no AnimeHub; só as duas pessoas escrevem nesta conversa.</Typography>
          )}
        </ProfileSection>
      </PageContainer>
    </Box>
  );
}
