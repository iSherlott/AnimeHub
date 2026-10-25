import { Box, Typography } from "@mui/material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPager } from "@/components/admin/AdminPager";
import { AdminPageHeader, AdminPanel, AdminTable, JobStateLabel, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { STATE_LABEL, type JobState } from "@/lib/adminImport/jobSteps";
import { PERIOD_OPTIONS, sinceFor } from "@/lib/adminJobView";
import { fmtDayClock, fmtFull, requireAdminPage } from "@/lib/adminPage";
import { durationMs, fmtDuration, JOB_KINDS, jobKindLabel, jobOutcome, jobsWhere, JOBS_PAGE_SIZE, kindSummaries, parseJobFilters, serviceSummaries } from "@/lib/jobsOverview";

export const dynamic = "force-dynamic";

const STATES: JobState[] = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"];

/**
 * Admin → Jobs (Fase 8, §15): todos os processos numa visão só — jobs do painel e serviços de fundo — com estado,
 * origem, duração, progresso, sucessos e falhas, última execução e a próxima prevista. Cada linha abre o detalhe.
 */
export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const f = parseJobFilters(await searchParams);
  const where = jobsWhere(f, sinceFor(f.periodo));
  const [total, jobs, kinds, services] = await Promise.all([
    prisma.adminJob.count({ where }),
    prisma.adminJob.findMany({ where, orderBy: { seq: "desc" }, skip: f.pagina * JOBS_PAGE_SIZE, take: JOBS_PAGE_SIZE }),
    kindSummaries(),
    serviceSummaries(),
  ]);
  const now = new Date();
  const params = Object.fromEntries(Object.entries({ tipo: f.tipo, estado: f.estado, periodo: f.periodo, q: f.q, falhas: f.falhas ? "1" : "" }).filter(([, v]) => v)) as Record<string, string>;
  const exportHref = `/api/admin/jobs/export${Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : ""}`;

  return (
    <>
      <AdminPageHeader title="Jobs" subtitle="Todos os processos: importações, curadoria, traduções, atualizações e os serviços de fundo." action={<AdminButtonLink href={exportHref}>Exportar CSV</AdminButtonLink>} />

      <AdminPanel title="Por tipo de processo" testId="jobs-kinds">
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
          {kinds.map((k) => (
            <Box component="li" key={k.kind} data-testid={`jobs-kind-${k.kind}`} sx={{ border: 1, borderColor: "divider", borderRadius: "10px", p: 1.5, display: "flex", flexDirection: "column", gap: 0.5, fontSize: 13 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <strong>{k.label}</strong>
                {k.running ? <SmallChip tone="accent">rodando #{k.running.seq}</SmallChip> : k.failed24h ? <SmallChip tone="warning">{k.failed24h} falha(s) 24 h</SmallChip> : null}
              </Box>
              <span suppressHydrationWarning>Última: {k.last ? `#${k.last.seq} · ${STATE_LABEL[k.last.state as JobState] ?? k.last.state} · ${fmtFull(k.last.createdAt, timeZone)}` : "nunca rodou"}</span>
              <span suppressHydrationWarning>Último sucesso: {k.lastOk ? `#${k.lastOk.seq} · ${fmtFull(k.lastOk.finishedAt ?? k.lastOk.createdAt, timeZone)}` : "—"}</span>
              {k.runningSignal && <span suppressHydrationWarning>Sinal de vida: {fmtFull(k.runningSignal, timeZone)}</span>}
              <span>{k.exclusive ? "Um por vez (trava)." : "Vários lotes em revisão."}</span>
            </Box>
          ))}
        </Box>
      </AdminPanel>

      <AdminPanel title="Serviços de fundo" testId="jobs-services">
        <AdminTable
          caption="Serviços"
          rows={services}
          rowKey={(s) => s.key}
          columns={[
            { key: "s", label: "Serviço", render: (s) => s.label },
            { key: "l", label: "Última execução", render: (s) => <span suppressHydrationWarning>{s.lastAt ? `${fmtFull(s.lastAt, timeZone)} · ${s.lastStatus}` : "nunca"}</span> },
            { key: "o", label: "Último sucesso", render: (s) => <span suppressHydrationWarning>{s.lastOkAt ? fmtFull(s.lastOkAt, timeZone) : "—"}</span> },
            { key: "i", label: "Itens (ok · falha)", render: (s) => (s.processed === null ? "—" : `${s.processed} · ${s.failedItems ?? 0}`) },
            { key: "n", label: "Próxima", render: (s) => <span suppressHydrationWarning>{s.nextAt ? `${fmtFull(s.nextAt, timeZone)}${s.late ? " · atrasado" : ""}` : "sob demanda"}</span> },
            { key: "f", label: "Falhas 24 h", render: (s) => (s.failures24h === null ? "—" : s.failures24h) },
          ]}
        />
      </AdminPanel>

      <AdminFilters
        fields={[
          { kind: "search", name: "q", label: "Job / fonte / responsável", placeholder: "#123, AniList…", value: f.q },
          { kind: "select", name: "tipo", label: "Tipo", value: f.tipo, width: 230, options: [{ value: "", label: "Todos" }, ...Object.entries(JOB_KINDS).map(([v, k]) => ({ value: v, label: k.label }))] },
          { kind: "select", name: "estado", label: "Estado", value: f.estado, width: 180, options: [{ value: "", label: "Todos" }, ...STATES.map((s) => ({ value: s, label: STATE_LABEL[s] }))] },
          { kind: "select", name: "periodo", label: "Período local", value: f.periodo, width: 180, options: PERIOD_OPTIONS },
          { kind: "select", name: "falhas", label: "Só falhas", value: f.falhas ? "1" : "", width: 140, options: [{ value: "", label: "Não" }, { value: "1", label: "Sim" }] },
        ]}
      />

      {jobs.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="admin-jobs-empty" icon={<AccountTreeOutlinedIcon />} title="Nenhum job encontrado.">
            Os jobs aparecem aqui quando uma importação, curadoria, tradução ou atualização é iniciada. Ajuste os filtros se esperava ver algum.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <AdminTable
            caption={`Jobs (${total.toLocaleString("pt-BR")})`}
            testId="admin-jobs-list"
            rows={jobs}
            rowKey={(j) => String(j.seq)}
            columns={[
              { key: "job", label: "Job", render: (j) => <a href={`/admin/jobs/${j.seq}`} style={{ color: "inherit" }} data-testid={`job-link-${j.seq}`}>#{j.seq}</a> },
              { key: "tipo", label: "Processo", render: (j) => `${jobKindLabel(j.kind)}${j.season ? ` · ${j.season}` : ""}` },
              { key: "origem", label: "Origem", render: (j) => (j.adminName ? `manual · ${j.adminName}` : "automático") },
              { key: "state", label: "Estado", render: (j) => <JobStateLabel state={j.state as JobState} /> },
              { key: "at", label: "Início", render: (j) => <span suppressHydrationWarning>{fmtDayClock(j.createdAt, timeZone)}</span> },
              { key: "dur", label: "Duração", render: (j) => <span suppressHydrationWarning>{fmtDuration(durationMs(j, now))}</span> },
              { key: "prog", label: "Progresso", render: (j) => `${j.total ? `${j.processed}/${j.total}` : j.processed || "—"}${j.progressNote ? ` · ${j.progressNote}` : ""}` },
              {
                key: "res",
                label: "Sucessos · falhas",
                render: (j) => {
                  const o = jobOutcome(j);
                  return o.ok === null && o.failed === null ? "—" : `${o.ok ?? "—"} · ${o.failed ?? 0}`;
                },
              },
            ]}
          />
          <AdminPager basePath="/admin/jobs" params={params} page={f.pagina} pages={Math.max(1, Math.ceil(total / JOBS_PAGE_SIZE))} total={total} pageSize={JOBS_PAGE_SIZE} />
        </>
      )}
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        Nenhum job mede episódios assistidos, progresso de usuário ou histórico de consumo: só catálogo, agenda, traduções e avisos.
      </Typography>
    </>
  );
}
