import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Box, Typography } from "@mui/material";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState, ErrorNotice } from "@/components/StatePanels";
import { STATE_LABEL, type JobState } from "@/lib/adminImport/jobSteps";
import { PERIOD_OPTIONS, sinceFor, sourceOptions } from "@/lib/adminJobView";
import { fmtClock, fmtFull, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

const LEVELS = ["INFO", "WARN", "ERROR"] as const;
const LEVEL_LABEL: Record<string, string> = { INFO: "Informação", WARN: "Atenção", ERROR: "Erro" };

/** Admin → Logs (Figma `8:5077`): eventos de domínio legíveis, cada um com contexto técnico e origem. */
export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage();
  const sp = await searchParams;
  const jobSeq = /^\d{1,9}$/.test(sp.job ?? "") ? Number(sp.job) : null;
  const fonte = (sp.fonte ?? "").slice(0, 40);
  const nivel = (LEVELS as readonly string[]).includes(sp.nivel ?? "") ? (sp.nivel as string) : "";
  const periodo = ["hoje", "7d", "30d"].includes(sp.periodo ?? "") ? (sp.periodo as string) : "";
  const since = sinceFor(periodo);

  const where: Prisma.AdminLogWhereInput = {
    ...(jobSeq !== null ? { jobSeq } : {}),
    ...(fonte ? { source: fonte } : {}),
    ...(nivel ? { level: nivel } : {}),
    ...(since ? { at: { gte: since } } : {}),
  };
  const [recent, jobs, sources, selectedJob] = await Promise.all([
    prisma.adminLog.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: 200 }),
    prisma.adminJob.findMany({ orderBy: { seq: "desc" }, take: 20, select: { seq: true, state: true } }),
    sourceOptions(),
    jobSeq !== null ? prisma.adminJob.findUnique({ where: { seq: jobSeq }, select: { seq: true, state: true } }) : Promise.resolve(null),
  ]);
  // Os 200 mais recentes, exibidos em ordem cronológica.
  const logs = [...recent].reverse();
  const lastError = recent.find((l) => l.level === "ERROR");

  return (
    <>
      <AdminPageHeader title="Logs" subtitle="Eventos de domínio legíveis. Cada entrada conserva contexto técnico e origem." />
      <AdminFilters
        fields={[
          { kind: "select", name: "job", label: "Job", value: jobSeq !== null ? String(jobSeq) : "", width: 240, options: [{ value: "", label: "Todos os jobs" }, ...jobs.map((j) => ({ value: String(j.seq), label: `#${j.seq} · ${STATE_LABEL[j.state as JobState] ?? j.state}` }))] },
          { kind: "select", name: "fonte", label: "Fonte", value: fonte, width: 200, options: [{ value: "", label: "Todas" }, ...sources.map((s) => ({ value: s, label: s }))] },
          { kind: "select", name: "nivel", label: "Nível", value: nivel, width: 200, options: [{ value: "", label: "Todos" }, ...LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))] },
          { kind: "select", name: "periodo", label: "Data", value: periodo, width: 220, options: PERIOD_OPTIONS },
        ]}
      />
      {selectedJob && (
        <SmallChip icon={<InfoOutlinedIcon />}>
          #{selectedJob.seq} {STATE_LABEL[selectedJob.state as JobState]?.toUpperCase() ?? selectedJob.state} · distinto dos demais jobs
        </SmallChip>
      )}

      {logs.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="admin-logs-empty" icon={<FilterListOutlinedIcon />} title="Nenhum evento para este filtro.">
            Os eventos aparecem quando uma importação é analisada, revisada ou confirmada. Remova filtros para ver mais.
          </EmptyState>
        </AdminPanel>
      ) : (
        <AdminTable
          caption="Eventos"
          testId="admin-logs-table"
          rows={logs}
          rowKey={(l) => l.id}
          columns={[
            { key: "t", label: "Hora local", render: (l) => <span suppressHydrationWarning>{fmtClock(l.at, timeZone)}</span> },
            { key: "e", label: "Evento", render: (l) => l.event },
            { key: "m", label: "Mensagem", render: (l) => l.message },
            { key: "c", label: "Contexto", render: (l) => [l.context, l.adminName ? `admin ${l.adminName}` : null].filter(Boolean).join(" · ") || "—" },
          ]}
        />
      )}

      {lastError && (
        <ErrorNotice title={`Erro${lastError.jobSeq ? ` / job #${lastError.jobSeq}` : ""} · ${lastError.event}`} testId="logs-error">
          {lastError.message} {lastError.context ? `${lastError.context} · ` : ""}
          <span suppressHydrationWarning>{fmtFull(lastError.at, timeZone)}</span> local.
        </ErrorNotice>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Campos de auditoria">
          <Typography sx={{ fontSize: 16, lineHeight: 1.7 }}>
            timestamp · momento exato da origem · source · fonte e identificador · jobID · correlação da execução · parserVersion · versão que interpretou o HTML · event · evento de domínio · message · descrição legível · admin / decision · autor e justificativa, se aplicável
          </Typography>
        </AdminPanel>
        <AdminPanel title="Leitura operacional">
          <Typography sx={{ fontSize: 16 }}>
            Não reproduzir um terminal indecifrável. Mostrar resumo, campo afetado e ação útil. UTC pode aparecer no detalhe técnico, com equivalente local; nunca substitui o horário público.
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Mostrando até os 200 eventos mais recentes do filtro, em ordem cronológica.</Typography>
        </AdminPanel>
      </Box>
    </>
  );
}
