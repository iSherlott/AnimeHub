import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, JobStateLabel, SmallChip, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { jobCounts } from "@/lib/adminImport/pipeline";
import { jobGuard, type JobStage, type JobState } from "@/lib/adminImport/jobSteps";
import { fmtClock, fmtDate, fmtDayClock, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

/** Admin → Dashboard (Figma `8:3436`, "Operação do catálogo"): o lote em análise, conflitos, jobs e atividades. */
export default async function AdminDashboardPage() {
  const { timeZone } = await requireAdminPage();
  const now = new Date();

  const [running, latest, lastAniDbOk, lastAniDb, jobs, logs, conflicts, pendingRecords] = await Promise.all([
    prisma.adminJob.findFirst({ where: { kind: "IMPORT", state: "RUNNING" }, orderBy: { seq: "desc" } }),
    prisma.adminJob.findFirst({ where: { kind: "IMPORT" }, orderBy: { seq: "desc" } }),
    prisma.adminJob.findFirst({ where: { source: "AniDB", state: "SUCCESS" }, orderBy: { finishedAt: "desc" } }),
    prisma.adminJob.findFirst({ where: { source: "AniDB" }, orderBy: { seq: "desc" } }),
    prisma.adminJob.findMany({ orderBy: { seq: "desc" }, take: 5 }),
    prisma.adminLog.findMany({ orderBy: { at: "desc" }, take: 4 }),
    prisma.catalogConflict.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 2 }),
    prisma.importRecord.findMany({ where: { state: "PENDING", job: { state: "RUNNING" } }, orderBy: { id: "asc" }, take: 2 }),
  ]);
  const focus = running ?? latest;
  const counts = focus ? await jobCounts(focus.seq) : null;
  const conflictsPending = await prisma.catalogConflict.count({ where: { status: "PENDING" } });

  const aniDbOnline = !lastAniDb || lastAniDb.state !== "FAILED";
  const rows = await Promise.all(
    jobs.map(async (job) => {
      const c = await jobCounts(job.seq);
      return { job, c };
    })
  );

  return (
    <>
      <AdminPageHeader
        title="Operação do catálogo"
        subtitle={focus ? `Observabilidade do lote ${focus.season ?? ""} · ${focus.source} · sessão de ${fmtDate(now, timeZone)}` : "Observabilidade das importações do catálogo"}
        action={
          <AdminButtonLink href="/admin/importacoes" variant="primary" icon={<FileDownloadOutlinedIcon />}>
            Importar temporada
          </AdminButtonLink>
        }
      />

      {!focus || !counts ? (
        <AdminPanel>
          <EmptyState
            testId="admin-dashboard-empty"
            icon={<FileDownloadOutlinedIcon />}
            title="Nenhuma importação ainda."
            action={
              <AdminButtonLink href="/admin/importacoes" variant="primary">
                Importar temporada
              </AdminButtonLink>
            }
          >
            Cole o HTML de uma temporada para gerar uma prévia revisável. Nada é salvo automaticamente.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <StatGrid>
            <StatCard
              testId="admin-stat-preview"
              label={`Prévia / ${(focus.season ?? "").toUpperCase()}`}
              value={counts.total}
              hint={`${counts.auto + counts.confirmed} matches + ${counts.created} novos + ${counts.pendingRecords} pendentes`}
            />
            <StatCard testId="admin-stat-conflicts" label="Conflitos" value={conflictsPending} hint="pendentes nesta prévia · não salva" />
            <StatCard
              testId="admin-stat-job"
              label={`Job #${focus.seq}`}
              value={`${counts.resolved}/${counts.total}`}
              hint={focus.state === "RUNNING" ? "Matching em execução" : focus.state === "SUCCESS" ? "Importação concluída" : focus.state === "FAILED" ? "Falhou" : "Cancelado"}
            />
            <StatCard
              testId="admin-stat-source"
              label="AniDB / Scraper"
              value={aniDbOnline ? "Online" : "Falha"}
              hint={lastAniDbOk?.finishedAt ? `último sucesso hoje · ${fmtClock(lastAniDbOk.finishedAt, timeZone)}` : "sem importação concluída ainda"}
            />
          </StatGrid>

          {running && counts.blocking > 0 && (
            <Box data-testid="admin-review-banner" sx={{ display: "flex", gap: 2, p: 2.5, borderRadius: "12px", bgcolor: "background.paper", border: 1, borderColor: "divider" }}>
              <InfoOutlinedIcon sx={{ fontSize: 20, color: "warning.main", mt: 0.25 }} />
              <Box>
                <Typography component="h2" sx={{ fontSize: 16 }}>
                  Revisão necessária antes do commit
                </Typography>
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                  O lote em análise contém {counts.blocking} {counts.blocking === 1 ? "pendência" : "pendências"}. Confirmar importação permanece bloqueado até resolução; nenhum registro da prévia foi salvo.
                </Typography>
              </Box>
            </Box>
          )}
        </>
      )}

      {rows.length > 0 && (
        <AdminTable
          caption="Jobs recentes"
          testId="admin-jobs-table"
          rows={rows}
          rowKey={(r) => String(r.job.seq)}
          columns={[
            { key: "job", label: "Job", render: (r) => `#${r.job.seq}` },
            { key: "op", label: "Operação / Fonte", render: (r) => `Importação · ${r.job.source}` },
            { key: "state", label: "Estado", render: (r) => <JobStateLabel state={r.job.state as JobState} /> },
            {
              key: "ctx",
              label: "Contexto",
              render: (r) =>
                jobGuard({ state: r.job.state as JobState, stage: r.job.stage as JobStage, total: r.c.total, resolved: r.c.resolved, pending: r.c.blocking, error: r.job.error }),
            },
            {
              key: "act",
              label: "Ação",
              render: (r) => (
                <a href={`/admin/jobs/${r.job.seq}`} style={{ color: "inherit" }}>
                  {r.job.state === "FAILED" ? "Investigar" : r.job.state === "RUNNING" ? "Abrir detalhe" : "Ver logs"}
                </a>
              ),
            },
          ]}
        />
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Conflitos prioritários" testId="admin-priority">
          {conflicts.length === 0 && pendingRecords.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma pendência de revisão.</Typography>
          ) : (
            <>
              {conflicts.map((c) => (
                <Box key={c.id} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <SmallChip tone="warning">Broadcast divergente</SmallChip>
                  <Typography sx={{ fontSize: 16 }}>
                    {c.titleSnapshot} · fonte A {fmtDayClock(c.aValue, timeZone)} vs fonte B {fmtDayClock(c.bValue, timeZone)}.
                  </Typography>
                </Box>
              ))}
              {pendingRecords.map((r) => (
                <Box key={r.id} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <SmallChip tone="warning">Identidade de produção</SmallChip>
                  <Typography sx={{ fontSize: 16 }}>{r.titleRomaji} · validar vínculo com a produção sugerida.</Typography>
                </Box>
              ))}
              <Box>
                <AdminButtonLink href={conflicts.length > 0 ? "/admin/conflitos" : "/admin/matching"} icon={<ArrowForwardIcon />}>
                  Revisar pendências
                </AdminButtonLink>
              </Box>
            </>
          )}
        </AdminPanel>

        <AdminPanel title="Últimas atividades" testId="admin-activity">
          {logs.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma atividade registrada ainda.</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0.5 }}>
              {logs.map((l) => (
                <Typography key={l.id} component="li" suppressHydrationWarning sx={{ fontSize: 16 }}>
                  {fmtClock(l.at, timeZone)}
                  {l.jobSeq ? ` · #${l.jobSeq}` : ""} · {l.message}
                </Typography>
              ))}
            </Box>
          )}
          <Box>
            <AdminButtonLink href="/admin/logs" icon={<FilterListOutlinedIcon />}>
              Abrir logs
            </AdminButtonLink>
          </Box>
        </AdminPanel>
      </Box>
    </>
  );
}
