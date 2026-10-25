import { notFound } from "next/navigation";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, JobStateLabel, SmallChip, adminPanelSx } from "@/components/admin/AdminUi";
import { GenericJobDetail } from "@/components/admin/GenericJobDetail";
import { RetryJobButton } from "@/components/admin/RetryJobButton";
import { ErrorNotice } from "@/components/StatePanels";
import { deriveSteps, STAGE_LABEL, STATE_LABEL, type JobStage, type JobState } from "@/lib/adminImport/jobSteps";
import { stageText, stepsInputFor } from "@/lib/adminJobView";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

/** Admin → Jobs → Detalhe (Figma `8:4919`): progresso, etapas, provenance e a próxima ação — sem sugerir commit antes da revisão. */
export default async function AdminJobDetailPage({ params }: { params: Promise<{ seq: string }> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) notFound();
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job) notFound();
  // Fase 8: os demais tipos (AniList, curadoria, tradução, linhas do tempo, atualização seletiva) têm o detalhe genérico.
  if (job.kind !== "IMPORT") return <GenericJobDetail job={job} timeZone={timeZone} />;

  const input = await stepsInputFor(job);
  const alerts = await prisma.catalogConflict.count({ where: { jobSeq: seq, status: "RESOLVED", resolution: { in: ["B", "MANUAL"] } } });
  const steps = deriveSteps({ ...input, alertsPrepared: alerts });
  const state = job.state as JobState;
  const stage = job.stage as JobStage;
  const pct = input.total > 0 ? Math.round((input.resolved / input.total) * 100) : 0;
  const remaining = input.total - input.resolved;

  const subtitle =
    state === "RUNNING"
      ? `${job.source} · ${job.season ?? ""} · ${stageText(stage)} em execução · snapshot antes da confirmação`
      : state === "SUCCESS"
        ? `${job.source} · ${job.season ?? ""} · concluído e aplicado`
        : state === "FAILED"
          ? `${job.source} · ${job.season ?? ""} · falhou na etapa ${stageText(stage)}`
          : `${job.source} · ${job.season ?? ""} · cancelado antes do commit`;

  return (
    <>
      <AdminPageHeader
        title={`Job #${seq}`}
        subtitle={subtitle}
        action={
          <AdminButtonLink href="/admin/jobs" icon={<ArrowBackIcon />}>
            Voltar aos jobs
          </AdminButtonLink>
        }
      />

      <Box component="section" data-testid="job-progress" sx={{ ...adminPanelSx, gap: 2.5 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            {STAGE_LABEL[stage]} · {STATE_LABEL[state]}
          </Typography>
          <SmallChip tone={state === "SUCCESS" ? "success" : state === "FAILED" ? "accent" : "neutral"}>
            {STATE_LABEL[state]} · {state === "RUNNING" ? "Em execução" : state === "SUCCESS" ? "Concluído" : state === "FAILED" ? "Falha" : state === "CANCELLED" ? "Cancelado" : "Aguardando"}
          </SmallChip>
        </Box>
        <Typography sx={{ fontSize: 40, lineHeight: 1.2 }}>
          {input.resolved}/{input.total}
        </Typography>
        <Box role="progressbar" aria-label="Progresso do matching" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} sx={{ height: 8, borderRadius: 4, bgcolor: "#171820", overflow: "hidden" }}>
          <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: "primary.main" }} />
        </Box>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {input.resolved} registros processados pelo matching; {remaining} {remaining === 1 ? "restante" : "restantes"}. Este progresso não significa commit.
        </Typography>
      </Box>

      <AdminTable
        caption="Etapas do job"
        testId="job-steps"
        rows={steps}
        rowKey={(s) => s.stage}
        columns={[
          { key: "stage", label: "Etapa", render: (s) => STAGE_LABEL[s.stage] },
          { key: "state", label: "Estado", render: (s) => <JobStateLabel state={s.state} /> },
          { key: "detail", label: "Detalhe / Guarda", render: (s) => s.detail },
        ]}
      />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Provenance">
          <Typography sx={{ fontSize: 16, lineHeight: 1.7 }} suppressHydrationWarning>
            JobID · #{seq} · Fonte · {job.source} · ParserVersion · {job.parserVersion ?? "—"} · Criado em · {fmtFull(job.createdAt, timeZone)} · Etapa atual · {STAGE_LABEL[stage]} · Origem · HTML / {job.season ?? "—"}
            {job.adminName ? ` · Por · ${job.adminName}` : ""} · Confirmação de commit · {state === "SUCCESS" ? "Recebida" : "Não recebida"}
          </Typography>
        </AdminPanel>
        <AdminPanel title="Próxima ação">
          <Typography sx={{ fontSize: 16 }}>
            {state === "RUNNING"
              ? "O job prepara uma prévia. Resolva as pendências no Resultado da importação e confirme para autorizar o Commit."
              : state === "FAILED"
                ? "Nenhuma alteração foi salva. Uma nova tentativa gera outro job e preserva a auditoria desta falha."
                : state === "SUCCESS"
                  ? "Nada pendente neste job. As decisões e a origem ficam auditáveis nos logs."
                  : "O job foi cancelado; para analisar de novo, volte ao HTML."}
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <AdminButtonLink href={`/admin/logs?job=${seq}`} icon={<FilterListOutlinedIcon />}>
              Ver logs do job
            </AdminButtonLink>
            {state === "RUNNING" && <AdminButtonLink href={`/admin/importacoes/${seq}`}>{input.pending > 0 ? "Abrir resultado" : "Confirmar commit"}</AdminButtonLink>}
            {state === "SUCCESS" && <AdminButtonLink href={`/admin/importacoes/${seq}`}>Abrir resultado</AdminButtonLink>}
          </Box>
        </AdminPanel>
      </Box>

      {state === "FAILED" && (
        <Box component="section" data-testid="job-failed" sx={{ ...adminPanelSx, gap: 2.5 }}>
          <Typography component="h2" sx={{ fontSize: 20, textTransform: "uppercase" }}>
            Variante failed / Job #{seq}
          </Typography>
          <SmallChip tone="accent">Failed · Falha no {stageText(stage)}</SmallChip>
          <ErrorNotice title="Falha ao processar importação.">
            JobID #{seq} · Fonte {job.source} · ParserVersion {job.parserVersion ?? "—"} · {job.error ?? "erro desconhecido"} · Timestamp {job.createdAt.toISOString()} (<span suppressHydrationWarning>{fmtFull(job.createdAt, timeZone)}</span> local). Nenhuma alteração foi salva.
          </ErrorNotice>
          <RetryJobButton seq={seq} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Falha é um job separado, não o estado atual de outro lote. Nova tentativa gera outro job e preserva a auditoria.</Typography>
        </Box>
      )}
    </>
  );
}
