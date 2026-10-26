import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import { Box, Typography } from "@mui/material";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPager } from "@/components/admin/AdminPager";
import { StartFieldUpdate } from "@/components/admin/StartFieldUpdate";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { fmtDate, requireAdminPage } from "@/lib/adminPage";
import { loadWorksPage, parseWorksFilters, QUALITY_FILTERS, WORKS_PAGE_SIZE, worksWhereFull, type WorkRow } from "@/lib/adminWorks";
import { prisma } from "@/lib/prisma";
import { FORMATS, STATUSES } from "@/lib/catalogEdit";
import { KIND_LABELS, type Kind } from "@/lib/curation/kind";
import { SEASON_LABEL, STATUS_LABEL } from "@/lib/workLabels";

export const dynamic = "force-dynamic";

/**
 * Admin → Catálogo de obras (Fase 3): a lista canônica (`CatalogEntry`), com filtros de qualidade e paginação no servidor.
 * Cada linha leva ao detalhe da obra, onde ela é revisada e editada.
 */
export default async function AdminWorksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const sp = await searchParams;
  const f = parseWorksFilters(sp);
  const { rows, total, page, pages } = await loadWorksPage(f);
  // Quantas obras do filtro cada fonte consegue comparar (as que têm o identificador dela).
  const where = await worksWhereFull(f);
  const [withAnilist, withKitsu, withAnidb] = await Promise.all([
    prisma.catalogEntry.count({ where: { AND: [where, { anilistId: { not: null } }] } }),
    prisma.catalogEntry.count({ where: { AND: [where, { kitsuId: { not: null } }] } }),
    prisma.catalogEntry.count({ where: { AND: [where, { anidbId: { not: null } }] } }),
  ]);
  const params = Object.fromEntries(Object.entries({ q: f.q, formato: f.formato, situacao: f.situacao, ano: f.ano, temporada: f.temporada, fonte: f.fonte, visibilidade: f.visibilidade, pendencias: f.pendencias, qualidade: f.qualidade }).filter(([, v]) => v)) as Record<string, string>;

  return (
    <>
      <AdminPageHeader
        title="Catálogo de obras"
        subtitle="A obra canônica: o que vale para a plataforma. Cópias (página pública, listas, agenda) seguem daqui."
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <StartFieldUpdate filter={new URLSearchParams(params).toString()} total={withAnilist} />
            <StartFieldUpdate filter={new URLSearchParams(params).toString()} total={withKitsu} source="kitsu" />
            <StartFieldUpdate filter={new URLSearchParams(params).toString()} total={withAnidb} source="anidb" />
          </Box>
        }
      />
      <AdminFilters
        fields={[
          { kind: "search", name: "q", label: "Buscar", placeholder: "Título ou ID (AniList, AniDB, Kitsu, MAL)", value: f.q },
          { kind: "select", name: "formato", label: "Formato", value: f.formato, width: 150, options: [{ value: "", label: "Todos" }, ...FORMATS.map((x) => ({ value: x, label: x }))] },
          { kind: "select", name: "situacao", label: "Situação", value: f.situacao, width: 170, options: [{ value: "", label: "Todas" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }))] },
          { kind: "select", name: "temporada", label: "Temporada", value: f.temporada, width: 150, options: [{ value: "", label: "Todas" }, ...Object.entries(SEASON_LABEL).map(([v, l]) => ({ value: v, label: l }))] },
          { kind: "select", name: "ano", label: "Ano", value: f.ano, width: 120, options: [{ value: "", label: "Todos" }, ...Array.from({ length: 2027 - 1960 + 1 }, (_, i) => String(2027 - i)).map((y) => ({ value: y, label: y }))] },
          { kind: "select", name: "fonte", label: "Fonte", value: f.fonte, width: 170, options: [{ value: "", label: "Todas" }, { value: "anilist", label: "AniList" }, { value: "anidb", label: "AniDB" }, { value: "sem-anilist", label: "Sem AniList ID" }] },
          { kind: "select", name: "visibilidade", label: "Visibilidade", value: f.visibilidade, width: 170, options: [{ value: "", label: "Na plataforma" }, { value: "cache", label: "Só cache de busca" }] },
          { kind: "select", name: "pendencias", label: "Pendências", value: f.pendencias, width: 170, options: [{ value: "", label: "Todas" }, { value: "com", label: "Com pendência" }, { value: "sem", label: "Sem pendência" }] },
          { kind: "select", name: "qualidade", label: "Qualidade", value: f.qualidade, width: 230, options: [{ value: "", label: "Qualquer" }, ...Object.entries(QUALITY_FILTERS).map(([v, q]) => ({ value: v, label: q.label }))] },
        ]}
      />

      {rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="admin-works-empty" icon={<LibraryBooksOutlinedIcon />} title="Nenhuma obra para este filtro.">
            Tire um filtro ou procure por outro título ou identificador.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <AdminTable<WorkRow>
            caption={`Obras (${total.toLocaleString("pt-BR")})`}
            testId="admin-works-table"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "obra",
                label: "Obra",
                width: "34%",
                render: (r) => (
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", minWidth: 0 }}>
                    <Box sx={{ width: 40, flexShrink: 0, aspectRatio: "3 / 4", borderRadius: "6px", overflow: "hidden", bgcolor: "#171820" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.coverImage && <img src={r.coverImage} alt="" width={40} height={53} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <AdminButtonLink href={`/admin/obras/${r.id}`}>
                        <span lang={r.titleNative ? "ja" : undefined} data-testid={`work-link-${r.id}`}>{r.titleNative ?? r.titleRomaji}</span>
                      </AdminButtonLink>
                      <Typography sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>
                        {[r.titleNative ? r.titleRomaji : null, r.titleEnglish].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                  </Box>
                ),
              },
              {
                key: "ids",
                label: "Identificadores",
                render: (r) => <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[r.anilistId && `AniList ${r.anilistId}`, r.anidbId && `AniDB ${r.anidbId}`, r.kitsuId && `Kitsu ${r.kitsuId}`, r.malId && `MAL ${r.malId}`].filter(Boolean).join(" · ") || "—"}</Typography>,
              },
              { key: "tipo", label: "Formato · tipo", render: (r) => [r.format, r.kind ? KIND_LABELS[r.kind as Kind] ?? r.kind : null].filter(Boolean).join(" · ") || "—" },
              { key: "epoca", label: "Época", render: (r) => [r.season ? SEASON_LABEL[r.season] : null, r.seasonYear].filter(Boolean).join(" ") || "—" },
              { key: "situacao", label: "Situação", render: (r) => (r.status ? STATUS_LABEL[r.status] ?? r.status : "—") },
              {
                key: "eps",
                label: "Episódios",
                render: (r) => (
                  <span title="informado pela fonte · na agenda · já exibidos">
                    {r.episodes ?? "?"} · {r.scheduled} · {r.aired}
                  </span>
                ),
              },
              {
                key: "estado",
                label: "Estado",
                render: (r) => (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {!r.onPlatform && <SmallChip>Cache</SmallChip>}
                    {r.openIssues > 0 && <SmallChip tone="warning">{r.openIssues} pendência(s)</SmallChip>}
                    {r.manualFields.length > 0 && <SmallChip tone="accent">Manual</SmallChip>}
                  </Box>
                ),
              },
              { key: "upd", label: "Atualizada", render: (r) => <span suppressHydrationWarning>{fmtDate(new Date(r.updatedAt), timeZone)}</span> },
            ]}
          />
          <AdminPager basePath="/admin/obras" params={params} page={page} pages={pages} total={total} pageSize={WORKS_PAGE_SIZE} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Episódios: informado pela fonte · cadastrados na agenda · já exibidos. &quot;Manual&quot;: tem campo corrigido à mão, protegido contra a importação.
          </Typography>
        </>
      )}
    </>
  );
}
