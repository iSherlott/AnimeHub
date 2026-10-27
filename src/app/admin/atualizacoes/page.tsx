import SyncAltOutlinedIcon from "@mui/icons-material/SyncAltOutlined";
import { Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = { COLLECT: "Coletando", REVIEW: "Em revisão", APPLY: "Executando", DONE: "Concluído" };

/**
 * Admin → Atualização seletiva (Fase 6, §11): lotes que comparam o catálogo com a AniList campo a campo. Para começar,
 * filtre o Catálogo de obras e use "Atualizar campos pela AniList".
 */
export default async function AdminFieldUpdatesPage() {
  const { timeZone } = await requireAdminPage("catalog");
  const jobs = await prisma.adminJob.findMany({ where: { kind: "FIELD_UPDATE" }, orderBy: { seq: "desc" }, take: 50 });
  return (
    <>
      <AdminPageHeader
        title="Atualização seletiva"
        subtitle="Compare o catálogo com a AniList e escolha exatamente quais campos atualizar. Nada muda até a execução."
        action={<AdminButtonLink href="/admin/obras">Escolher obras no catálogo</AdminButtonLink>}
      />
      {jobs.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="field-updates-empty" icon={<SyncAltOutlinedIcon />} title="Nenhum lote ainda.">
            Filtre o Catálogo de obras (por exemplo, &quot;Sem sinopse&quot;) e use &quot;Atualizar campos pela AniList&quot;.
          </EmptyState>
        </AdminPanel>
      ) : (
        <AdminTable
          caption="Lotes"
          testId="field-updates-table"
          rows={jobs}
          rowKey={(j) => String(j.seq)}
          columns={[
            { key: "seq", label: "Lote", render: (j) => <AdminButtonLink href={`/admin/atualizacoes/${j.seq}`}>{`#${j.seq}`}</AdminButtonLink> },
            { key: "o", label: "Obras", render: (j) => `${j.total} · ${j.season ?? ""}` },
            { key: "s", label: "Etapa", render: (j) => <SmallChip tone={j.stage === "DONE" ? "success" : "warning"}>{STAGE_LABEL[j.stage] ?? j.stage}</SmallChip> },
            { key: "a", label: "Quem", render: (j) => j.adminName ?? "—" },
            { key: "t", label: "Criado", render: (j) => <span suppressHydrationWarning>{fmtFull(j.createdAt, timeZone)}</span> },
          ]}
        />
      )}
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        Fontes: hoje a comparação é com a AniList (títulos, sinopse, gêneros, ficha, imagens e site oficial). A Kitsu e o AniDB completam os episódios.
      </Typography>
    </>
  );
}
