import { AdminPageHeader } from "@/components/admin/AdminUi";
import { AnidbOnlyPanel } from "@/components/admin/AnidbOnlyPanel";
import { MatchNamePanel } from "@/components/admin/MatchNamePanel";
import { requireAdminPage } from "@/lib/adminPage";
import { loadWorkLinkPanel } from "@/lib/workLinkActions";

export const dynamic = "force-dynamic";

/**
 * Admin → Match name: continuações que o nome sugere (“Overlord” → “Overlord IV”) para o admin confirmar ou recusar, e a
 * junção manual de obras com nomes diferentes (“Naruto” → “Boruto”). Confirmar junta as duas na mesma franquia.
 */
export default async function AdminMatchNamePage() {
  await requireAdminPage("catalog");
  const panel = await loadWorkLinkPanel();
  return (
    <>
      <AdminPageHeader title="Match name" subtitle="Confirme quais obras são continuação de outra e junte à mão as que o nome não entrega." />
      <MatchNamePanel suggestions={panel.suggestions} confirmed={panel.confirmed} rejected={panel.rejected} />
      <AnidbOnlyPanel />
    </>
  );
}
