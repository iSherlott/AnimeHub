import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader, AdminPanel, AdminTable, JobStateLabel } from "@/components/admin/AdminUi";
import { ImportForm } from "@/components/admin/ImportForm";
import { Notice } from "@/components/StatePanels";
import { jobCounts } from "@/lib/adminImport/pipeline";
import { jobGuard, type JobStage, type JobState } from "@/lib/adminImport/jobSteps";
import { fmtDayClock, requireAdminPage } from "@/lib/adminPage";
import { recentSeasons, seasonLabel } from "@/lib/exploreGroups";

export const dynamic = "force-dynamic";

/** Admin → Importações (Figma `8:3894`): HTML colado → prévia revisável. Nada é salvo automaticamente. */
export default async function AdminImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage();
  const sp = await searchParams;
  const from = Number(sp.from);
  const origin = Number.isInteger(from) && from > 0 ? await prisma.adminJob.findUnique({ where: { seq: from }, select: { html: true, season: true } }) : null;

  const seasons = recentSeasons(new Date(), 12).map(seasonLabel);
  const jobs = await prisma.adminJob.findMany({ where: { kind: "IMPORT" }, orderBy: { seq: "desc" }, take: 5 });
  const rows = await Promise.all(jobs.map(async (job) => ({ job, c: await jobCounts(job.seq) })));

  return (
    <>
      <AdminPageHeader title="Importar temporada" titleCase="upper" subtitle="Cole o HTML da fonte para gerar uma prévia revisável. Nada é salvo automaticamente." />
      <ImportForm seasons={seasons} initialHtml={origin?.html ?? ""} initialSeason={origin?.season ?? undefined} />

      <Notice tone="info" title="Revisão obrigatória">
        HTML → Parse → Normalize → Matching → Prévia → Confirmação → Commit. Campos ausentes não recebem valores inventados; conflitos e matches ambíguos devem ser resolvidos antes da confirmação.
      </Notice>

      <AdminPanel title="Validação e segurança">
        <Typography sx={{ fontSize: 16 }}>
          Fonte e temporada obrigatórias. HTML vazio bloqueia ANALISAR com mensagem junto ao campo. O conteúdo é tratado como texto, sem executar scripts. Origem, timestamp, versão do parser e job ficam registrados para auditoria.
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Formato aceito: <code>&lt;section data-season=&quot;Autumn2026&quot;&gt;&lt;article data-anidb-id=&quot;19777&quot;&gt;&lt;h2&gt;Título&lt;/h2&gt;&lt;/article&gt;&lt;/section&gt;</code>, com{" "}
          <code>data-type</code>, <code>data-year</code> e <code>data-aired</code> opcionais. Loading mantém o formulário; falha preserva o HTML e oferece nova tentativa. Sem autosave.
        </Typography>
      </AdminPanel>

      {rows.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Importações recentes
          </Typography>
          <AdminTable
            caption="Importações recentes"
            testId="admin-import-recent"
            rows={rows}
            rowKey={(r) => String(r.job.seq)}
            columns={[
              { key: "job", label: "Job", render: (r) => `#${r.job.seq}` },
              { key: "src", label: "Fonte / Temporada", render: (r) => `${r.job.source} · ${r.job.season ?? "—"}` },
              { key: "state", label: "Estado", render: (r) => <JobStateLabel state={r.job.state as JobState} /> },
              {
                key: "ctx",
                label: "Resultado",
                render: (r) => jobGuard({ state: r.job.state as JobState, stage: r.job.stage as JobStage, total: r.c.total, resolved: r.c.resolved, pending: r.c.blocking, error: r.job.error }),
              },
              { key: "at", label: "Início local", render: (r) => <span suppressHydrationWarning>{fmtDayClock(r.job.createdAt, timeZone)}</span> },
              {
                key: "act",
                label: "Ação",
                render: (r) => (
                  <a href={r.job.state === "FAILED" ? `/admin/jobs/${r.job.seq}` : `/admin/importacoes/${r.job.seq}`} style={{ color: "inherit" }}>
                    {r.job.state === "FAILED" ? "Investigar" : "Abrir resultado"}
                  </a>
                ),
              },
            ]}
          />
        </Box>
      )}
    </>
  );
}
