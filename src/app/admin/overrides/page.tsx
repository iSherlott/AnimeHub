import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader, AdminPanel, AdminTable } from "@/components/admin/AdminUi";
import { RemoveOverrideButton } from "@/components/admin/RemoveOverrideButton";
import { EmptyState, Notice } from "@/components/StatePanels";
import { fmtClock, fmtDayClock, fmtFull, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

/** Admin → Overrides (Figma `8:4471`): valores manuais com prioridade, origem preservada e trilha de auditoria. */
export default async function AdminOverridesPage() {
  const { timeZone } = await requireAdminPage();
  const overrides = await prisma.catalogOverride.findMany({ where: { removedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <>
      <AdminPageHeader title="Overrides" subtitle="Valores manuais com prioridade, origem preservada e trilha de auditoria." />
      <Notice tone="info" title="Override ativo não esconde o valor original">
        O valor efetivo pode mudar, mas a fonte, o original, o administrador e a data permanecem visíveis. Remover exige confirmação e restaura a origem.
      </Notice>

      {overrides.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="admin-overrides-empty" icon={<EditOutlinedIcon />} title="Nenhum override ativo.">
            Overrides nascem de decisões em Conflitos (fonte B ou valor manual). Enquanto não houver nenhum, o calendário usa o horário da fonte.
          </EmptyState>
        </AdminPanel>
      ) : (
        <AdminTable
          caption="Overrides ativos"
          testId="admin-overrides-table"
          rows={overrides}
          rowKey={(o) => o.id}
          columns={[
            {
              key: "p",
              label: "Produção / Campo",
              render: (o) => (
                <>
                  <div lang="ja">{o.titleSnapshot} · AniList #{o.anilistId}</div>
                  <div>Horário de exibição · EP{String(o.episode).padStart(2, "0")}</div>
                </>
              ),
            },
            {
              key: "o",
              label: "Original / Fonte",
              render: (o) => (
                <>
                  <div suppressHydrationWarning>{fmtDayClock(o.originalValue, timeZone)}</div>
                  <div>{o.originalSource}</div>
                </>
              ),
            },
            { key: "v", label: "Override", render: (o) => <span suppressHydrationWarning>{fmtDayClock(o.value, timeZone)} · ativo</span> },
            {
              key: "a",
              label: "Admin / Data",
              render: (o) => (
                <>
                  <div>{o.adminName}</div>
                  <div suppressHydrationWarning>{fmtFull(o.createdAt, timeZone)}</div>
                  <div>{o.reason}</div>
                </>
              ),
            },
            {
              key: "x",
              label: "Ação",
              render: (o) => (
                <RemoveOverrideButton
                  id={o.id}
                  subject={`Horário · ${o.titleSnapshot} · override ${fmtClock(o.value, timeZone)} · original ${fmtClock(o.originalValue, timeZone)} · Fonte ${o.originalSource} · ${o.adminName} · ${fmtFull(o.createdAt, timeZone)}.`}
                  effect={`O horário efetivo voltará de ${fmtDayClock(o.value, timeZone)} para o valor original ${fmtDayClock(o.originalValue, timeZone)} da fonte ${o.originalSource}. O valor original não é apagado e a remoção será registrada nos logs.`}
                />
              ),
            },
          ]}
        />
      )}
    </>
  );
}
