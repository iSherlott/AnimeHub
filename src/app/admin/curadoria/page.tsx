import { Stack } from "@mui/material";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { CurationPanel } from "@/components/admin/CurationPanel";
import { requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

/**
 * Admin → Curadoria (Epic 42): passa por todas as obras do catálogo — tipo (episódios, OVA, ODA, filme), gêneros, títulos,
 * sinopses, site oficial e linha do tempo — com o andamento ao vivo e a lista do que ficou pendente (ADR).
 */
export default async function AdminCurationPage() {
  await requireAdminPage();
  return (
    <Stack spacing={3}>
      <AdminPageHeader title="Curadoria do catálogo" subtitle="Revisa obra por obra, completa o que as fontes têm e deixa em lista o que não deu para resolver." />
      <CurationPanel />
    </Stack>
  );
}
