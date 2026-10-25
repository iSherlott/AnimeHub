import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import { Box, Typography } from "@mui/material";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPager } from "@/components/admin/AdminPager";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { fmtDate, requireAdminPage } from "@/lib/adminPage";
import { CORRESPONDENCE_STATES, CORRESPONDENCES_PAGE_SIZE, DIVERGENCES, KIND_LABELS, loadCorrespondences, parseCorrespondenceFilters, type CorrespondenceRow } from "@/lib/correspondences";

export const dynamic = "force-dynamic";

/**
 * Admin → Correspondências (Fase 6, §9): as decisões de identidade numa lista só — registros da importação do AniDB e
 * obras só do AniDB com sugestão da AniList. A similaridade é sugestão, não prova: cada linha mostra o que coincide e o
 * que diverge. Exporta em CSV e mostra as decisões anteriores (estado "Decidida").
 */
export default async function AdminCorrespondencesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const f = parseCorrespondenceFilters(await searchParams);
  const { rows, total, page, pages } = await loadCorrespondences(f);
  const params = Object.fromEntries(Object.entries({ fonte: f.fonte, estado: f.estado === "pendente" ? "" : f.estado, similaridade: f.similaridade, divergencia: f.divergencia, q: f.q }).filter(([, v]) => v)) as Record<string, string>;
  const exportHref = `/api/admin/correspondences/export${Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : ""}`;

  return (
    <>
      <AdminPageHeader
        title="Correspondências"
        subtitle="Qual obra é qual entre as fontes. A similaridade é uma sugestão: confira o que coincide e o que diverge antes de confirmar."
        action={<AdminButtonLink href={exportHref}>Exportar CSV</AdminButtonLink>}
      />
      <AdminFilters
        fields={[
          { kind: "search", name: "q", label: "Buscar", placeholder: "Título, AniDB ou AniList ID", value: f.q },
          { kind: "select", name: "fonte", label: "Fonte", value: f.fonte, width: 250, options: [{ value: "", label: "Todas" }, ...Object.entries(KIND_LABELS).map(([v, l]) => ({ value: v, label: l }))] },
          { kind: "select", name: "estado", label: "Estado", value: f.estado === "pendente" ? "" : f.estado, width: 180, options: [{ value: "", label: "Pendente" }, { value: "depois", label: CORRESPONDENCE_STATES.depois }, { value: "decidida", label: "Decididas (histórico)" }, { value: "todas", label: "Todas" }] },
          { kind: "select", name: "similaridade", label: "Similaridade mínima", value: f.similaridade, width: 190, options: [{ value: "", label: "Qualquer" }, { value: "0.5", label: "≥ 50%" }, { value: "0.7", label: "≥ 70%" }, { value: "0.9", label: "≥ 90%" }] },
          { kind: "select", name: "divergencia", label: "Diverge em", value: f.divergencia, width: 170, options: [{ value: "", label: "Qualquer" }, ...Object.entries(DIVERGENCES).map(([v, l]) => ({ value: v, label: l }))] },
        ]}
      />
      {rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="correspondences-empty" icon={<CompareArrowsOutlinedIcon />} title="Nenhuma correspondência para este filtro.">
            Sem decisões pendentes de identidade. Veja o histórico em &quot;Decididas&quot;.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <AdminTable<CorrespondenceRow>
            caption={`Correspondências (${total.toLocaleString("pt-BR")})`}
            testId="correspondences-table"
            rows={rows}
            rowKey={(r) => r.key}
            columns={[
              {
                key: "rec",
                label: "Recebido",
                width: "26%",
                render: (r) => (
                  <Box sx={{ minWidth: 0 }}>
                    <AdminButtonLink href={`/admin/correspondencias/${r.kind}/${r.id}`}>
                      <span data-testid={`correspondence-link-${r.key}`} lang={r.received.titleNative ? "ja" : undefined}>{r.received.titleNative ?? r.received.titleRomaji ?? r.id}</span>
                    </AdminButtonLink>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[r.received.titleNative ? r.received.titleRomaji : null, r.received.year, r.received.format].filter(Boolean).join(" · ")}</Typography>
                  </Box>
                ),
              },
              { key: "fonte", label: "Fonte", render: (r) => <Typography sx={{ fontSize: 12 }}>{r.sourceLabel}</Typography> },
              {
                key: "cand",
                label: "Candidato",
                width: "22%",
                render: (r) => (r.candidate ? <span>{`${r.candidate.titleNative ?? r.candidate.titleRomaji ?? "?"}${r.candidate.anilistId ? ` · AniList ${r.candidate.anilistId}` : ""}`}</span> : <span>Sem candidato</span>),
              },
              { key: "score", label: "Similaridade", render: (r) => (r.score !== null ? `${Math.round(r.score * 100)}%` : "—") },
              {
                key: "cmp",
                label: "Coincide · diverge",
                render: (r) => (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }} data-testid={`correspondence-compare-${r.key}`}>
                    {r.matching.map((m) => <SmallChip key={m} tone="success">{m}</SmallChip>)}
                    {r.diverging.map((d) => <SmallChip key={d} tone="warning">{DIVERGENCES[d].toLowerCase()}</SmallChip>)}
                  </Box>
                ),
              },
              { key: "estado", label: "Estado", render: (r) => <SmallChip tone={r.state === "pendente" ? "warning" : "neutral"}>{r.state === "decidida" ? `${r.rawState}${r.decidedBy ? ` · ${r.decidedBy}` : ""}` : CORRESPONDENCE_STATES[r.state]}</SmallChip> },
              { key: "data", label: "Importado", render: (r) => <span suppressHydrationWarning>{fmtDate(new Date(r.importedAt), timeZone)}</span> },
            ]}
          />
          <AdminPager basePath="/admin/correspondencias" params={params} page={page} pages={pages} total={total} pageSize={CORRESPONDENCES_PAGE_SIZE} />
        </>
      )}
    </>
  );
}
