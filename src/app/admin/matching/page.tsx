import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

/** Admin → Matching: fila de registros que precisam de decisão humana (Figma `8:4179` mostra um por vez). */
export default async function AdminMatchingPage() {
  await requireAdminPage("catalog");
  const pending = await prisma.importRecord.findMany({
    where: { state: "PENDING", job: { state: "RUNNING" } },
    orderBy: [{ jobSeq: "desc" }, { titleRomaji: "asc" }],
    take: 100,
  });

  return (
    <>
      <AdminPageHeader title="Matching" subtitle="Registros importados que precisam de uma decisão antes do commit." />
      {pending.length === 0 ? (
        <AdminPanel>
          <EmptyState
            testId="admin-matching-empty"
            icon={<CompareArrowsOutlinedIcon />}
            title="Nenhuma correspondência pendente."
            action={
              <AdminButtonLink href="/admin/importacoes" variant="primary">
                Importar temporada
              </AdminButtonLink>
            }
          >
            As decisões já tomadas continuam acessíveis no resultado de cada importação e nos logs.
          </EmptyState>
        </AdminPanel>
      ) : (
        <AdminTable
          caption="Correspondências pendentes"
          testId="admin-matching-table"
          rows={pending}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "r",
              label: "Registro / Fonte",
              render: (r) => (
                <>
                  <div>{r.titleRomaji}</div>
                  <div>AniDB #{r.sourceKey}</div>
                </>
              ),
            },
            { key: "s", label: "Score", render: (r) => (r.score !== null ? `${Math.round(r.score * 100)}%` : "Sem candidato") },
            { key: "j", label: "Prévia", render: (r) => `#${r.jobSeq}` },
            { key: "a", label: "Ação", render: (r) => <a href={`/admin/matching/${r.id}`} style={{ color: "inherit" }}>Revisar matching</a> },
          ]}
        />
      )}
    </>
  );
}
