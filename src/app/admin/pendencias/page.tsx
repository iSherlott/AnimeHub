import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import { Box, Typography } from "@mui/material";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPager } from "@/components/admin/AdminPager";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { IssueActions } from "@/components/admin/IssueActions";
import { EmptyState } from "@/components/StatePanels";
import { fmtDate, requireAdminPage } from "@/lib/adminPage";
import { ISSUE_CODES, ISSUE_LABELS } from "@/lib/curation/issues";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/curation/priority";
import { ISSUE_STATES, loadQueue, parseQueueFilters, QUEUE_PAGE_SIZE, queueIndicators } from "@/lib/curation/queue";

export const dynamic = "force-dynamic";

const TONE: Record<Priority, "warning" | "accent" | "neutral"> = { alta: "warning", media: "accent", informativa: "neutral" };

/**
 * Admin → Pendências (Fase 7, §14): a fila de trabalho da curadoria, priorizada pelo impacto no produto, com
 * indicadores. Ausência de campo opcional fica como informativa, nunca como incidente crítico.
 */
export default async function AdminIssuesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const f = parseQueueFilters(await searchParams);
  const [queue, ind] = await Promise.all([loadQueue(f), queueIndicators()]);
  const params = Object.fromEntries(Object.entries({ tipo: f.tipo, prioridade: f.prioridade, fonte: f.fonte, estado: f.estado === "OPEN" ? "" : f.estado, de: f.de, ate: f.ate, q: f.q }).filter(([, v]) => v)) as Record<string, string>;
  return (
    <>
      <AdminPageHeader title="Pendências" subtitle="A fila de qualidade do catálogo, por prioridade. A prioridade de cada tipo é configurável (CURATION_PRIORITIES)." action={<AdminButtonLink href="/admin/curadoria">Rodar a curadoria</AdminButtonLink>} />
      <StatGrid>
        <StatCard testId="issues-open" label="Abertas" value={ind.open.toLocaleString("pt-BR")} hint={`${ind.critical.toLocaleString("pt-BR")} de prioridade alta`} />
        <StatCard testId="issues-resolved" label="Resolvidas" value={ind.resolved.toLocaleString("pt-BR")} hint={`${ind.resolved30d.toLocaleString("pt-BR")} nos últimos 30 dias · ${ind.dismissed.toLocaleString("pt-BR")} ignoradas`} />
        <StatCard testId="issues-time" label="Tempo médio de resolução" value={ind.avgResolutionHours === null ? "Dados insuficientes" : `${ind.avgResolutionHours < 48 ? `${Math.round(ind.avgResolutionHours)} h` : `${Math.round(ind.avgResolutionHours / 24)} dias`}`} hint="só as resolvidas depois que a data passou a ser registrada" />
        <StatCard testId="issues-reopen" label="Recorrentes" value={ind.recurring.toLocaleString("pt-BR")} hint={ind.reopenRate === null ? "taxa de reabertura: dados insuficientes" : `taxa de reabertura: ${(ind.reopenRate * 100).toFixed(1)}%`} />
      </StatGrid>
      <AdminPanel title="Abertas por tipo e fonte" testId="issues-by-type">
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {ind.byType.map((t) => (
            <AdminButtonLink key={t.code} href={`/admin/pendencias?tipo=${t.code}`}>{`${t.label}: ${t.open.toLocaleString("pt-BR")} (${PRIORITY_LABELS[t.priority].toLowerCase()})`}</AdminButtonLink>
          ))}
        </Box>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{`Por fonte: AniList ${ind.bySource.anilist.toLocaleString("pt-BR")} · só AniDB ${ind.bySource.anidb.toLocaleString("pt-BR")}`}</Typography>
      </AdminPanel>
      <AdminFilters
        fields={[
          { kind: "search", name: "q", label: "Obra", placeholder: "Título", value: f.q },
          { kind: "select", name: "tipo", label: "Tipo", value: f.tipo, width: 240, options: [{ value: "", label: "Todos" }, ...ISSUE_CODES.map((c) => ({ value: c, label: ISSUE_LABELS[c].title }))] },
          { kind: "select", name: "prioridade", label: "Prioridade", value: f.prioridade, width: 160, options: [{ value: "", label: "Todas" }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))] },
          { kind: "select", name: "fonte", label: "Fonte", value: f.fonte, width: 150, options: [{ value: "", label: "Todas" }, { value: "anilist", label: "AniList" }, { value: "anidb", label: "Só AniDB" }] },
          { kind: "select", name: "estado", label: "Estado", value: f.estado === "OPEN" ? "" : f.estado, width: 150, options: [{ value: "", label: "Abertas" }, { value: "RESOLVED", label: "Resolvidas" }, { value: "DISMISSED", label: "Ignoradas" }] },
          { kind: "search", name: "de", label: "Desde (AAAA-MM-DD)", placeholder: "2026-10-01", value: f.de },
          { kind: "search", name: "ate", label: "Até (AAAA-MM-DD)", placeholder: "2026-10-31", value: f.ate },
        ]}
      />
      {queue.rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="issues-empty" icon={<FactCheckOutlinedIcon />} title="Nenhuma pendência neste filtro.">
            Tire um filtro ou veja as resolvidas e ignoradas.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <AdminTable
            caption={`Pendências (${queue.total.toLocaleString("pt-BR")})`}
            testId="issues-table"
            rows={queue.rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "p", label: "Prioridade", render: (r) => <SmallChip tone={TONE[r.priority]}>{PRIORITY_LABELS[r.priority]}</SmallChip> },
              { key: "o", label: "Obra", width: "24%", render: (r) => <AdminButtonLink href={`/admin/obras/${r.entryId}`}><span data-testid={`issue-work-${r.id}`}>{r.title}</span></AdminButtonLink> },
              { key: "t", label: "Motivo", width: "28%", render: (r) => <span title={r.why}>{`${r.label}${r.detail ? ` — ${r.detail}` : ""}`}</span> },
              { key: "f", label: "Fonte", render: (r) => r.source },
              { key: "d", label: "Desde", render: (r) => <span suppressHydrationWarning>{`${fmtDate(r.createdAt, timeZone)}${r.reopenCount ? ` · reaberta ${r.reopenCount}x` : ""}`}</span> },
              { key: "s", label: "Estado", render: (r) => `${ISSUE_STATES[r.status as keyof typeof ISSUE_STATES] ?? r.status}${r.dismissedReason ? ` (${r.dismissedReason})` : ""}` },
              { key: "a", label: "Ações", render: (r) => <IssueActions id={r.id} status={r.status} /> },
            ]}
          />
          <AdminPager basePath="/admin/pendencias" params={params} page={queue.page} pages={queue.pages} total={queue.total} pageSize={QUEUE_PAGE_SIZE} />
        </>
      )}
    </>
  );
}
