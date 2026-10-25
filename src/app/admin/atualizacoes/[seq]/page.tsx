import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminUi";
import { FieldUpdateReview } from "@/components/admin/FieldUpdateReview";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";
import { FIELD_GROUPS, FIELD_UPDATE_LABELS } from "@/lib/fieldUpdate";

export const dynamic = "force-dynamic";

/** Admin → Atualização seletiva → lote (Fase 6): diferenças, escolha de campos, prévia, execução e resultado. */
export default async function AdminFieldUpdatePage({ params }: { params: Promise<{ seq: string }> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq)) notFound();
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job || job.kind !== "FIELD_UPDATE") notFound();
  const groups = Object.fromEntries(Object.entries(FIELD_GROUPS).map(([k, g]) => [k, { label: g.label, fields: [...g.fields] as string[] }]));
  return (
    <>
      <AdminPageHeader
        title={`Atualização seletiva #${job.seq}`}
        subtitle={`${job.season ?? ""} · ${job.total} obra(s) · ${job.adminName ?? "admin"} · ${fmtFull(job.createdAt, timeZone)}`}
        action={<AdminButtonLink href="/admin/atualizacoes">Todos os lotes</AdminButtonLink>}
      />
      <AdminPanel testId="field-update-panel">
        <FieldUpdateReview seq={job.seq} groups={groups} labels={FIELD_UPDATE_LABELS} />
      </AdminPanel>
    </>
  );
}
