import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminUi";
import { CommunityReportsQueue } from "@/components/community/CommunityOrkut";
import { openReports } from "@/lib/community";
import { requireAdminPage } from "@/lib/adminPage";
import { can } from "@/lib/auth/permissions";

/**
 * Denúncias (moderação: comentários, publicações e as das comunidades dos animes) e, para o administrador, convites, usuários e papéis (Fase 9: o moderador vê só a moderação).
 */
export default async function AdminAccessPage() {
  const { role, actor } = await requireAdminPage("moderation");
  const communityReports = await openReports();
  return (
    <>
      <AdminPageHeader
        title="Acesso e moderação"
        subtitle="Cadastro é só por convite. Gere um código, compartilhe fora daqui, e quem receber usa em /signup."
      />
      <AdminPanel title={`Denúncias das comunidades (${communityReports.length})`} testId="admin-community-reports">
        <CommunityReportsQueue reports={communityReports} />
      </AdminPanel>
      <AdminDashboard canManageUsers={can(role, "admin")} currentUserId={actor.id} />
    </>
  );
}
