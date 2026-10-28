import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminUi";
import { CommunityReportsQueue } from "@/components/community/CommunityPanels";
import { openReports } from "@/lib/community";
import { ProfileReportsQueue } from "@/components/profile/ProfileActions";
import { openProfileReports } from "@/lib/profileSocial";
import { requireAdminPage } from "@/lib/adminPage";
import { can } from "@/lib/auth/permissions";

/**
 * Denúncias (moderação: comentários, publicações, as das comunidades dos animes e as dos perfis — recados e depoimentos) e, para o administrador, convites, usuários e papéis (Fase 9: o moderador vê só a moderação).
 */
export default async function AdminAccessPage() {
  const { role, actor } = await requireAdminPage("moderation");
  const [communityReports, profileReports] = await Promise.all([openReports(), openProfileReports()]);
  return (
    <>
      <AdminPageHeader
        title="Acesso e moderação"
        subtitle="As contas nascem aqui, com senha provisória (o AnimeHub é fechado). Abaixo, as denúncias das comunidades e dos perfis e os papéis de cada pessoa."
      />
      <AdminPanel title={`Denúncias das comunidades (${communityReports.length})`} testId="admin-community-reports">
        <CommunityReportsQueue reports={communityReports} />
      </AdminPanel>
      <AdminPanel title={`Denúncias dos perfis (${profileReports.length})`} testId="admin-profile-reports">
        <ProfileReportsQueue reports={profileReports} />
      </AdminPanel>
      <AdminDashboard canManageUsers={can(role, "admin")} currentUserId={actor.id} />
    </>
  );
}
