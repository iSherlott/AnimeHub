import type { AdminJob } from "@prisma/client";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, JobStateLabel } from "@/components/admin/AdminUi";
import { CancelJobButton } from "@/components/admin/CancelJobButton";
import { ErrorNotice } from "@/components/StatePanels";
import type { JobState } from "@/lib/adminImport/jobSteps";
import { fmtFull } from "@/lib/adminPage";
import { EXCLUSIVE_KINDS, lastSignal } from "@/lib/jobLock";
import { durationMs, fmtDuration, JOB_KINDS, jobKindLabel, previousAttempts, type JobKind } from "@/lib/jobsOverview";

/** Resumo legível do resultado guardado: só números e textos curtos (nada de listas longas nem dados sensíveis). */
function summary(resultJson: string | null): Array<[string, string]> {
  if (!resultJson) return [];
  try {
    const r = JSON.parse(resultJson) as Record<string, unknown>;
    return Object.entries(r)
      .filter(([, v]) => typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 80))
      .slice(0, 24)
      .map(([k, v]) => [k, String(v)]);
  } catch {
    return [];
  }
}

/**
 * Detalhe de um job que não é importação de HTML (Fase 8): identificação, parâmetros não sensíveis, progresso, sinal
 * de vida, resultado, erro com contexto, logs, tentativas anteriores, o que ele gravou e as ações possíveis.
 */
export async function GenericJobDetail({ job, timeZone }: { job: AdminJob; timeZone: string }) {
  const [logs, attempts, changes, changeCount] = await Promise.all([
    prisma.adminLog.findMany({ where: { jobSeq: job.seq }, orderBy: { at: "desc" }, take: 100 }),
    previousAttempts(job),
    prisma.changeLog.findMany({ where: { jobSeq: job.seq }, orderBy: { at: "desc" }, take: 30 }),
    prisma.changeLog.count({ where: { jobSeq: job.seq } }),
  ]);
  const meta = JOB_KINDS[job.kind as JobKind];
  const running = job.state === "RUNNING";
  const exclusive = (EXCLUSIVE_KINDS as readonly string[]).includes(job.kind);
  const facts: Array<[string, string]> = [
    ["Processo", jobKindLabel(job.kind)],
    ["Parâmetros", [job.source, job.season].filter(Boolean).join(" · ") || "—"],
    ["Origem", job.adminName ? `manual · ${job.adminName}` : "automático"],
    ["Início", fmtFull(job.createdAt, timeZone)],
    ["Fim", job.finishedAt ? fmtFull(job.finishedAt, timeZone) : running ? "em execução" : "—"],
    ["Duração", fmtDuration(durationMs(job))],
    ["Progresso", `${job.total ? `${job.processed} de ${job.total}` : job.processed}${job.progressNote ? ` · ${job.progressNote}` : ""}`],
    ["Sinal de vida", running ? fmtFull(lastSignal(job), timeZone) : "—"],
    ["Repetir é seguro?", meta?.idempotent ?? "—"],
  ];
  return (
    <>
      <AdminPageHeader title={`Job #${job.seq}`} subtitle={`${jobKindLabel(job.kind)}${job.season ? ` · ${job.season}` : ""}`} action={<AdminButtonLink href="/admin/jobs">Voltar aos jobs</AdminButtonLink>} />
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }} data-testid="job-state">
        <JobStateLabel state={job.state as JobState} />
        {job.cancelRequestedAt && running && <Typography sx={{ fontSize: 13, color: "warning.main" }}>cancelamento pedido</Typography>}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Execução" testId="job-facts">
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.75, fontSize: 14 }}>
            {facts.map(([k, v]) => (
              <Box key={k} sx={{ display: "contents" }}>
                <Box component="dt" sx={{ color: "text.secondary" }}>{k}</Box>
                <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }} suppressHydrationWarning>{v}</Box>
              </Box>
            ))}
          </Box>
        </AdminPanel>
        <AdminPanel title="Ações" testId="job-actions">
          {running && exclusive && <CancelJobButton seq={job.seq} />}
          <Typography sx={{ fontSize: 14 }}>{meta?.rerun ?? "Inicie de novo pela tela do processo."}</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {meta && <AdminButtonLink href={job.kind === "FIELD_UPDATE" ? `/admin/atualizacoes/${job.seq}` : meta.where}>Abrir a tela do processo</AdminButtonLink>}
            <AdminButtonLink href={`/admin/logs?job=${job.seq}`}>Logs do job</AdminButtonLink>
          </Box>
        </AdminPanel>
      </Box>
      {job.error && (
        <Box data-testid="job-error">
          <ErrorNotice title={job.state === "CANCELLED" ? "Cancelado" : "Falha"}>
            {job.error} · {job.kind === "FIELD_UPDATE" ? "Cada obra é gravada inteira ou não é gravada: o resultado diz quais foram." : "O que já foi gravado antes da parada fica; repetir continua de onde parou."}
          </ErrorNotice>
        </Box>
      )}
      {summary(job.resultJson).length > 0 && (
        <AdminPanel title="Resultado" testId="job-result">
          <Typography sx={{ fontSize: 14 }}>{summary(job.resultJson).map(([k, v]) => `${k}: ${v}`).join(" · ")}</Typography>
        </AdminPanel>
      )}
      <AdminPanel title={`Alterações gravadas por este job (${changeCount})`} testId="job-changes">
        {changes.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma alteração de campo registrada com este job.</Typography>
        ) : (
          <AdminTable
            caption="Alterações"
            rows={changes}
            rowKey={(c) => c.id}
            columns={[
              { key: "t", label: "Quando", render: (c) => <span suppressHydrationWarning>{fmtFull(c.at, timeZone)}</span> },
              { key: "e", label: "Registro", render: (c) => (c.catalogEntryId ? <AdminButtonLink href={`/admin/obras/${c.catalogEntryId}`}>{`${c.entity} · ${c.field}`}</AdminButtonLink> : `${c.entity} · ${c.field}`) },
              { key: "b", label: "Antes → depois", render: (c) => `${(c.before ?? "—").slice(0, 60)} → ${(c.after ?? "—").slice(0, 60)}` },
            ]}
          />
        )}
      </AdminPanel>
      <AdminPanel title="Logs" testId="job-logs">
        {logs.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Sem eventos registrados.</Typography>
        ) : (
          <AdminTable
            caption="Eventos"
            rows={logs}
            rowKey={(l) => l.id}
            columns={[
              { key: "t", label: "Quando", render: (l) => <span suppressHydrationWarning>{fmtFull(l.at, timeZone)}</span> },
              { key: "n", label: "Nível", render: (l) => l.level },
              { key: "e", label: "Evento", render: (l) => l.event },
              { key: "m", label: "Mensagem", render: (l) => l.message },
            ]}
          />
        )}
      </AdminPanel>
      {attempts.length > 0 && (
        <AdminPanel title="Execuções anteriores" testId="job-attempts">
          <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 14 }}>
            {attempts.map((a) => (
              <li key={a.seq} suppressHydrationWarning>
                <AdminButtonLink href={`/admin/jobs/${a.seq}`}>{`#${a.seq}`}</AdminButtonLink> · {a.state} · {fmtFull(a.createdAt, timeZone)}
                {a.error ? ` · ${a.error.slice(0, 80)}` : ""}
              </li>
            ))}
          </Box>
        </AdminPanel>
      )}
    </>
  );
}
