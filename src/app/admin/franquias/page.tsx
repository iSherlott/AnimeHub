import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPageHeader, AdminTable } from "@/components/admin/AdminUi";
import { requireAdminPage } from "@/lib/adminPage";
import { listFranchises } from "@/lib/franchiseAdmin";

export const dynamic = "force-dynamic";

/** Admin → Franquias (Fase 7, §10): as linhas do tempo da plataforma, para conferir e definir a ordem à mão. */
export default async function AdminFranchisesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("catalog");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const page = Math.max(0, Number(sp.pagina) || 0);
  const rows = await listFranchises(q, page);
  return (
    <>
      <AdminPageHeader title="Franquias" subtitle="Linhas do tempo: a ordem das temporadas, especiais e obras relacionadas. A auditoria automática monta; o admin corrige." />
      <AdminFilters fields={[{ kind: "search", name: "q", label: "Buscar", placeholder: "Título de uma obra da franquia", value: q }]} />
      <AdminTable
        caption={`Franquias${q ? ` com "${q}"` : ""}`}
        testId="franchises-table"
        rows={rows}
        rowKey={(r) => String(r.key)}
        columns={[
          { key: "t", label: "Franquia", render: (r) => <AdminButtonLink href={`/admin/franquias/${r.key}`}><span data-testid={`franchise-link-${r.key}`}>{r.title ?? `Franquia ${r.key}`}</span></AdminButtonLink> },
          { key: "n", label: "Obras", render: (r) => r.works },
          { key: "m", label: "Com ordem manual", render: (r) => r.manual || "—" },
        ]}
      />
      {rows.length === 50 && <AdminButtonLink href={`/admin/franquias?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(page + 1) }).toString()}`}>Mais franquias</AdminButtonLink>}
    </>
  );
}
