import { notFound } from "next/navigation";
import CheckIcon from "@mui/icons-material/Check";
import RadioButtonUncheckedOutlinedIcon from "@mui/icons-material/RadioButtonUncheckedOutlined";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { ImportResultActions } from "@/components/admin/ImportResultActions";
import { PendingBulkReview, type PendingRow } from "@/components/admin/PendingBulkReview";
import { seasonLabel, type SeasonName } from "@/lib/exploreGroups";
import { Notice } from "@/components/StatePanels";
import { jobCounts } from "@/lib/adminImport/pipeline";
import { describeSummary, EMPTY_SUMMARY, type ApplySummary } from "@/lib/adminImport/apply";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

type ResultRow = { key: string; title: string; native: string | null; source: string; result: string; provenance: string; action: { label: string; href: string | null } };

function parseResult(json: string | null): ApplySummary | null {
  if (!json) return null;
  try {
    return { ...EMPTY_SUMMARY, ...(JSON.parse(json) as Partial<ApplySummary>) };
  } catch {
    return null;
  }
}

/** Admin → Importações → Resultado (Figma `8:4020`): a PRÉVIA do lote; nada foi salvo antes da confirmação. */
export default async function ImportResultPage({ params, searchParams }: { params: Promise<{ seq: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage();
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) notFound();
  const job = await prisma.adminJob.findUnique({ where: { seq }, select: { seq: true, source: true, season: true, state: true, error: true, createdAt: true, parserVersion: true, resultJson: true } });
  if (!job) notFound();

  const page = Math.max(0, Number((await searchParams).page) || 0);
  const [counts, records, conflicts, firstPendingRecord, firstPendingConflict] = await Promise.all([
    jobCounts(seq),
    prisma.importRecord.findMany({ where: { jobSeq: seq }, orderBy: [{ state: "asc" }, { titleRomaji: "asc" }], skip: page * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.catalogConflict.findMany({ where: { jobSeq: seq }, orderBy: { createdAt: "asc" } }),
    prisma.importRecord.findFirst({ where: { jobSeq: seq, state: "PENDING" }, orderBy: { titleRomaji: "asc" }, select: { id: true } }),
    prisma.catalogConflict.findFirst({ where: { jobSeq: seq, status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);

  // Revisão em lote: todas as pendências do lote (não só a página aberta), cada uma com o candidato do catálogo.
  const pendingAll = job.state === "RUNNING" ? await prisma.importRecord.findMany({ where: { jobSeq: seq, state: "PENDING" }, orderBy: { titleRomaji: "asc" }, take: 500 }) : [];
  const candidateIds = pendingAll.map((r) => r.matchedAnilistId).filter((id): id is number => id !== null);
  const candidateRows = candidateIds.length
    ? await prisma.catalogEntry.findMany({ where: { anilistId: { in: candidateIds } }, select: { anilistId: true, titleRomaji: true, season: true, seasonYear: true } })
    : [];
  const candidateById = new Map(candidateRows.map((c) => [c.anilistId as number, c]));
  const bulkRows: PendingRow[] = pendingAll.map((r) => {
    const c = r.matchedAnilistId !== null ? candidateById.get(r.matchedAnilistId) : undefined;
    const candidate = r.matchedProductionId ? { title: c?.titleRomaji ?? `Obra #${r.matchedAnilistId}`, detail: [c?.season && c.seasonYear ? seasonLabel({ season: c.season as SeasonName, year: c.seasonYear }) : null, r.matchedAnilistId !== null ? `AniList #${r.matchedAnilistId}` : null].filter(Boolean).join(" · ") } : null;
    const scorePct = r.score !== null ? Math.round(r.score * 100) : null;
    return { id: r.id, title: r.titleRomaji, native: r.titleNative, sourceKey: r.sourceKey, scorePct, candidate, suggested: candidate && scorePct !== null && scorePct >= 85 ? "confirm" : "new" };
  });

  const rows: ResultRow[] = [
    ...records.map((r): ResultRow => {
      const pct = r.score !== null ? Math.round(r.score * 100) : null;
      const base = { key: r.id, title: r.titleRomaji, native: r.titleNative, source: `${job.source} #${r.sourceKey}` };
      const captured = `HTML ${job.source} ${fmtFull(r.capturedAt, timeZone)}`;
      switch (r.state) {
        case "PENDING":
          return { ...base, result: `Pendente · matching ${pct ?? "—"}%`, provenance: captured, action: { label: "Revisar matching", href: `/admin/matching/${r.id}` } };
        case "AUTO":
          return { ...base, result: "Match automático", provenance: "Título normalizado + ano", action: { label: "Revisar", href: `/admin/matching/${r.id}` } };
        case "CONFIRMED":
          return { ...base, result: "Confirmado por admin", provenance: r.decidedByName ? `${r.decidedByName} · ${r.decidedAt ? fmtFull(r.decidedAt, timeZone) : ""}` : captured, action: { label: "Revisar", href: `/admin/matching/${r.id}` } };
        case "IGNORED":
          return { ...base, result: "Ignorado", provenance: r.note ?? "Excluído do commit", action: { label: "Revisar", href: `/admin/matching/${r.id}` } };
        default:
          return {
            ...base,
            result: `Novo${r.format ? ` · ${r.format}` : ""}`,
            provenance: !r.airsAt ? "Sem data no HTML" : r.airsAtHasTime ? "Data e hora no HTML" : "Data sem hora",
            action: { label: "Criar produção", href: null },
          };
      }
    }),
    ...conflicts
      .filter((c) => c.status === "PENDING")
      .map((c): ResultRow => ({
        key: c.id,
        title: c.titleSnapshot,
        native: null,
        source: `${c.bSource} × ${c.aSource}`,
        result: "Pendente · broadcast",
        provenance: `${c.bSource} ${fmtFull(c.bValue, timeZone)} × ${c.aSource} ${fmtFull(c.aValue, timeZone)}`,
        action: { label: "Comparar fontes", href: `/admin/conflitos?id=${c.id}` },
      })),
  ];

  const done = job.state === "SUCCESS";
  const stepChip = (label: string, state: "done" | "current" | "todo") => (
    <SmallChip
      key={label}
      tone={state === "current" ? "accent" : "neutral"}
      icon={state === "done" ? <CheckIcon /> : state === "todo" ? <RadioButtonUncheckedOutlinedIcon /> : undefined}
    >
      {label}
    </SmallChip>
  );
  const matched = counts.auto + counts.confirmed;
  const result = parseResult(job.resultJson);
  const firstPendingHref = firstPendingRecord ? `/admin/matching/${firstPendingRecord.id}` : firstPendingConflict ? `/admin/conflitos?id=${firstPendingConflict.id}` : null;
  const lastPage = Math.max(0, Math.ceil(counts.total / PAGE_SIZE) - 1);

  return (
    <>
      <AdminPageHeader
        title="Resultado da importação"
        subtitle={`${job.source} · ${job.season ?? ""} · ${done ? `lote #${job.seq} · aplicado ao catálogo` : job.state === "CANCELLED" ? `lote #${job.seq} · cancelado, nada foi aplicado` : `prévia do lote #${job.seq} · nada foi salvo`}.`}
      />

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }} aria-label="Etapas">
        {stepChip("HTML", "done")}
        {stepChip("Parse", "done")}
        {stepChip("Normalize", "done")}
        {stepChip("Matching", counts.pendingRecords > 0 && !done ? "current" : "done")}
        {stepChip(done ? "Prévia" : "Prévia atual", done ? "done" : "current")}
        {stepChip("Confirmação", done ? "done" : "todo")}
        {stepChip("Commit", done ? "done" : "todo")}
      </Box>

      <StatGrid>
        <StatCard testId="result-found" label="Encontrados" value={counts.total} hint="Total do HTML analisado" />
        <StatCard testId="result-matched" label="Correspondências" value={matched} hint="Automáticas · revisar amostra" />
        <StatCard testId="result-new" label="Novos" value={counts.created} hint="Produções a criar" />
        <StatCard testId="result-pending" label="Confirmação" value={counts.blocking} hint="Pendentes · bloqueiam commit" />
      </StatGrid>

      {job.state === "FAILED" ? (
        <Notice tone="error" title="Esta importação falhou.">
          {job.error ?? "Falha ao processar importação."} Nenhum registro foi salvo.
        </Notice>
      ) : job.state === "CANCELLED" ? (
        <Notice tone="info" title="Importação cancelada.">Nada foi aplicado ao catálogo. O HTML continua disponível para uma nova análise.</Notice>
      ) : done ? (
        <>
          <Notice tone="success" title="Importação concluída." testId="result-done">
            {result ? `${describeSummary(result)}. ` : ""}As decisões e a origem ficam auditáveis em Jobs e Logs.
          </Notice>
          {result && (result.deferred > 0 || (result.linked === 0 && matched > 0)) && (
            <Notice tone="warning" title="Parte do lote ficou sem aplicar." testId="result-partial">
              {result.linked === 0 && matched > 0
                ? `Nenhuma das ${matched} obras casadas foi ligada à plataforma. `
                : `${result.deferred} obra(s) casada(s) ainda sem produção. `}
              Use “Reaplicar vínculos” para completar o lote; nada é duplicado.
            </Notice>
          )}
        </>
      ) : counts.blocking > 0 ? (
        <Notice tone="warning" title={`${counts.blocking} ${counts.blocking === 1 ? "registro precisa" : "registros precisam"} de confirmação`} testId="result-blocked">
          Revise a identidade de produção e o broadcast divergente. O total fecha: {matched} + {counts.created} + {counts.blocking} = {counts.total}. CONFIRMAR IMPORTAÇÃO fica bloqueado enquanto houver pendências.
        </Notice>
      ) : (
        <Notice tone="success" title="Prévia pronta para confirmar." testId="result-ready">
          Nenhuma pendência restante. Confirme para criar o job de commit — até lá, nenhum registro foi salvo.
        </Notice>
      )}

      {job.state === "RUNNING" && <PendingBulkReview key={bulkRows.map((r) => r.id).join(",")} seq={seq} rows={bulkRows} />}

      {rows.length > 0 && (
        <AdminTable
          caption="Registros da prévia"
          testId="result-table"
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            {
              key: "r",
              label: "Registro / Fonte",
              render: (r) => (
                <>
                  <div>{r.title}</div>
                  {r.native && <div lang="ja">{r.native}</div>}
                  <div>{r.source}</div>
                </>
              ),
            },
            { key: "res", label: "Resultado", render: (r) => r.result },
            { key: "prov", label: "Provenance", render: (r) => <span suppressHydrationWarning>{r.provenance}</span> },
            { key: "act", label: "Ação", render: (r) => (r.action.href ? <a href={r.action.href} style={{ color: "inherit" }}>{r.action.label}</a> : r.action.label) },
          ]}
        />
      )}

      {counts.total > PAGE_SIZE && (
        <Box component="nav" aria-label="Paginação" sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          {page > 0 && <a href={`/admin/importacoes/${seq}?page=${page - 1}`}>Anterior</a>}
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Página {page + 1} de {lastPage + 1}
          </Typography>
          {page < lastPage && <a href={`/admin/importacoes/${seq}?page=${page + 1}`}>Próxima</a>}
        </Box>
      )}

      <AdminPanel title="Resumo da prévia">
        <Typography sx={{ fontSize: 16 }}>
          {counts.total} encontrados no lote: {matched} matches, {counts.created} novos, {counts.ignored} ignorados e {counts.blocking} pendentes.
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Job #{seq} · parser {job.parserVersion ?? "—"} · analisado em <span suppressHydrationWarning>{fmtFull(job.createdAt, timeZone)}</span>. A tabela pagina o lote completo mantendo os contadores.
        </Typography>
      </AdminPanel>

      <ImportResultActions
        seq={seq}
        state={job.state}
        blocking={counts.blocking}
        firstPendingHref={firstPendingHref}
        subject={`${job.source} · ${job.season ?? ""} · ${counts.total} registros revisados: ${matched} automáticos, ${counts.created} novos e ${counts.confirmed} resolvidos. ${counts.blocking === 0 ? "Nenhuma pendência restante." : ""}`}
      />
    </>
  );
}
