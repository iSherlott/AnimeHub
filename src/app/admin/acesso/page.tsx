import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { requireAdminPage } from "@/lib/adminPage";
import { can } from "@/lib/auth/permissions";

/**
 * Denúncias (moderação) e, para o administrador, convites, usuários e papéis (Fase 9: o moderador vê só a moderação).
 */
export default async function AdminAccessPage() {
  const { role, actor } = await requireAdminPage("moderation");
  return (
    <>
      <AdminPageHeader
        title="Acesso e moderação"
        subtitle="Cadastro é só por convite. Gere um código, compartilhe fora daqui, e quem receber usa em /signup."
      />
      <AdminDashboard canManageUsers={can(role, "admin")} currentUserId={actor.id} />
    </>
  );
}
