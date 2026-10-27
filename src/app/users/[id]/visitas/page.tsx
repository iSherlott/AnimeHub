import { notFound, redirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { ProfileSection } from "@/components/profile/ProfileSections";
import { getCurrentUser } from "@/lib/auth/session";
import { recentVisitors, VISITS_WINDOW_DAYS } from "@/lib/profileVisits";
import { formatRelativeTime } from "@/lib/relativeTime";
import { loginHref } from "@/lib/safeRedirect";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** Quem visitou o perfil (só a dona vê), nos últimos 90 dias, das visitas mais recentes às mais antigas. */
export default async function VisitsPage({ params }: Props) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect(loginHref(`/users/${id}/visitas`));
  if (viewer.id !== id) notFound();
  const visitors = viewer.recordVisits ? await recentVisitors(id, 100) : null;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="プロフィール / VISITAS" title="Quem visitou meu perfil" subtitle={`Últimos ${VISITS_WINDOW_DAYS} dias. Só você vê esta lista.`} />
        <AppLink href={`/users/${id}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Meu perfil
        </AppLink>
        <ProfileSection id="visitas" title="visitas" count={visitors?.total} testId="visits-page">
          {!visitors ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              Você desligou o registro de visitas. Ligue em <AppLink href="/configuracoes">Configurações</AppLink> para ver quem visitou.
            </Typography>
          ) : visitors.rows.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ninguém visitou seu perfil nos últimos {VISITS_WINDOW_DAYS} dias.</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
              {visitors.rows.map((v) => (
                <Box component="li" key={v.id} data-testid={`visit-${v.id}`} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
                  <AppLink href={`/users/${v.id}`} aria-label={v.displayName}>
                    <UserAvatar id={v.id} displayName={v.displayName} avatarUrl={v.avatarUrl} size={40} />
                  </AppLink>
                  <Box sx={{ minWidth: 0 }}>
                    <AppLink href={`/users/${v.id}`} underline="hover" sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>
                      {v.displayName}
                    </AppLink>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[v.handle ? `@${v.handle}` : null, `visitou ${formatRelativeTime(v.visitedAt.toISOString())}`].filter(Boolean).join(" · ")}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </ProfileSection>
      </PageContainer>
    </Box>
  );
}
