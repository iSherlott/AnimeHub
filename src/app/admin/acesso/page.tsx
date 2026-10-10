import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminPageHeader } from "@/components/admin/AdminUi";

/** Convites, usuários, denúncias e execuções dos serviços (área que já existia antes do Figma de operações). */
export default function AdminAccessPage() {
  return (
    <>
      <AdminPageHeader
        title="Acesso e moderação"
        subtitle="Cadastro é só por convite. Gere um código, compartilhe fora daqui, e quem receber usa em /signup."
      />
      <AdminDashboard />
    </>
  );
}
