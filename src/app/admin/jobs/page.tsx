import { Box, Typography } from "@mui/material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPageHeader, AdminPanel, AdminTable, JobStateLabel, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { jobGuard, STATE_LABEL, type JobState } from "@/lib/adminImport/jobSteps";
import { PERIOD_OPTIONS, sinceFor, stepsInputFor } from "@/lib/adminJobView";
import { fmtDayClock, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

const STATES: JobState[] = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"];
const STATE_HINT: Record<JobState, string> = { PENDING: "Aguardando", RUNNING: "Em execução", SUCCESS: "Concluído", FAILED: "Falha", CANCELLED: "Cancelado" };

/** Admin → Jobs (Figma `8:4740`): fila operacional com estado, dependências e diagnóstico por execução. */
export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const estado = STATES.includes(sp.estado as JobState) ? (sp.estado as JobState) : "";
  const periodo = ["hoje", "7d", "30d"].includes(sp.periodo ?? "") ? (sp.periodo as string) : "";
  const since = sinceFor(periodo);
  const asSeq = /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null;

  const where: Prisma.AdminJobWhereInput = {
    ...(estado ? { state: estado } : {}),
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(q ? { OR: [{ source: { contains: q, mode: "insensitive" } }, { season: { contains: q, mode: "insensitive" } }, ...(asSeq !== null ? [{ seq: asSeq }] : [])] } : {}),
  };
  const jobs = await prisma.adminJob.findMany({ where, orderBy: { seq: "desc" }, take: 50 });
  const rows = await Promise.all(jobs.map(async (job) => ({ job, input: await stepsInputFor(job) })));

  return (
    <>
      <AdminPageHeader title="Jobs" subtitle="Fila operacional. Estado, dependências e diagnóstico por execução." />
      <AdminFilters
        fields={[
          { kind: "search", name: "q", label: "JobID / fonte", placeholder: "Buscar job…", value: q },
          { kind: "select", name: "estado", label: "Estado", value: estado, width: 204, options: [{ value: "", label: "Todos" }, ...STATES.map((s) => ({ value: s, label: STATE_LABEL[s] }))] },
          { kind: "select", name: "periodo", label: "Período local", value: periodo, width: 204, options: PERIOD_OPTIONS },
        ]}
      />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} aria-label="Legenda de estados">
        {STATES.map((s) => (
          <SmallChip key={s} tone={s === "SUCCESS" ? "success" : s === "FAILED" ? "accent" : "neutral"}>
            {STATE_LABEL[s]} · {STATE_HINT[s]}
          </SmallChip>
        ))}
      </Box>

      {rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="admin-jobs-empty" icon={<AccountTreeOutlinedIcon />} title="Nenhum job encontrado.">
            Jobs de importação aparecem aqui assim que uma temporada é analisada. Ajuste os filtros se esperava ver algum.
          </EmptyState>
        </AdminPanel>
      ) : (
        <AdminTable
          caption="Jobs"
          testId="admin-jobs-list"
          rows={rows}
          rowKey={(r) => String(r.job.seq)}
          columns={[
            { key: "job", label: "Job", render: (r) => <a href={`/admin/jobs/${r.job.seq}`} style={{ color: "inherit" }}>#{r.job.seq}</a> },
            { key: "tipo", label: "Tipo / Fonte", render: (r) => `Importação · ${r.job.source}${r.job.season ? ` · ${r.job.season}` : ""}` },
            { key: "state", label: "Estado", render: (r) => <JobStateLabel state={r.input.state} /> },
            { key: "guard", label: "Progresso / Guarda", render: (r) => jobGuard(r.input) },
            { key: "at", label: "Início local", render: (r) => <span suppressHydrationWarning>{fmtDayClock(r.job.createdAt, timeZone)}</span> },
          ]}
        />
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Dependências visíveis">
          <Typography sx={{ fontSize: 16 }}>
            Pending não equivale à falha. Um job em Running mostra o Matching em execução; Commit só aparece concluído depois da revisão e da confirmação.
          </Typography>
        </AdminPanel>
        <AdminPanel title="Sem dados de consumo">
          <Typography sx={{ fontSize: 16 }}>
            Jobs processam catálogo, matching, broadcast e notificações. Nenhum job mede episódios assistidos, progresso de usuário ou histórico de consumo.
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Abrir uma linha mostra etapas e contexto técnico legível.</Typography>
        </AdminPanel>
      </Box>
    </>
  );
}
