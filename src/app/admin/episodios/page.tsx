import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPager } from "@/components/admin/AdminPager";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { fmtDate, fmtFull, requireAdminPage } from "@/lib/adminPage";
import { EPISODE_ISSUES, EPISODE_SOURCES, EPISODE_STATE_FILTERS, EPISODES_PAGE_SIZE, loadEpisodesPage, parseEpisodesFilters, type EpisodeRow } from "@/lib/adminEpisodes";
import { RELEASE_STATE_LABELS, SOURCE_LABELS, type ReleaseState } from "@/lib/episodeState";

export const dynamic = "force-dynamic";

const STATE_TONE: Record<ReleaseState, "neutral" | "warning" | "accent" | "success"> = { AIRED: "success", SCHEDULED: "accent", EXPECTED: "neutral", UNKNOWN_DATE: "warning", POSTPONED: "warning", CANCELLED: "neutral" };
const dayLabel = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Admin → Episódios (Fase 4): os episódios globais — título, sinopse, data e situação de lançamento, fonte e pendências.
 * Sem nada de progresso pessoal: é o registro da obra, igual para todo mundo.
 */
export default async function AdminEpisodesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const f = parseEpisodesFilters(await searchParams);
  const [{ rows, total, page, pages }, work] = await Promise.all([
    loadEpisodesPage(f),
    f.obra ? prisma.catalogEntry.findUnique({ where: { id: f.obra }, select: { id: true, titleRomaji: true, titleNative: true, episodes: true } }) : Promise.resolve(null),
  ]);
  const params = Object.fromEntries(Object.entries({ obra: f.obra, q: f.q, numero: f.numero, situacao: f.situacao, fonte: f.fonte, de: f.de, ate: f.ate, pendencia: f.pendencia }).filter(([, v]) => v)) as Record<string, string>;

  return (
    <>
      <AdminPageHeader
        title="Episódios"
        subtitle={
          work ? (
            <>
              Obra: <AdminButtonLink href={`/admin/obras/${work.id}`}>{work.titleNative ?? work.titleRomaji}</AdminButtonLink> · total informado pela fonte: {work.episodes ?? "Dados insuficientes"} ·{" "}
              <AdminButtonLink href="/admin/episodios">ver todas as obras</AdminButtonLink>
            </>
          ) : (
            "Os episódios de cada obra, iguais para todo mundo: título, sinopse, data e situação do lançamento."
          )
        }
      />
      <AdminFilters
        keep={f.obra ? { obra: f.obra } : {}}
        fields={[
          ...(f.obra ? [] : [{ kind: "search" as const, name: "q", label: "Buscar", placeholder: "Obra, título do episódio ou AniList ID", value: f.q }]),
          { kind: "search", name: "numero", label: "Número", placeholder: "Ex.: 12", value: f.numero },
          { kind: "select", name: "situacao", label: "Situação", value: f.situacao, width: 200, options: [{ value: "", label: "Todas" }, ...EPISODE_STATE_FILTERS.map((s) => ({ value: s, label: RELEASE_STATE_LABELS[s] }))] },
          { kind: "select", name: "fonte", label: "Fonte", value: f.fonte, width: 170, options: [{ value: "", label: "Todas" }, ...EPISODE_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))] },
          { kind: "search", name: "de", label: "De (AAAA-MM-DD)", placeholder: "2026-10-01", value: f.de },
          { kind: "search", name: "ate", label: "Até (AAAA-MM-DD)", placeholder: "2026-10-31", value: f.ate },
          { kind: "select", name: "pendencia", label: "Pendência", value: f.pendencia, width: 240, options: [{ value: "", label: "Qualquer" }, ...Object.entries(EPISODE_ISSUES).map(([v, l]) => ({ value: v, label: l }))] },
        ]}
      />

      {rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="admin-episodes-empty" icon={<VideoLibraryOutlinedIcon />} title="Nenhum episódio para este filtro.">
            Tire um filtro, ou confira na obra se a fonte já informou os episódios.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <AdminTable<EpisodeRow>
            caption={`Episódios (${total.toLocaleString("pt-BR")})`}
            testId="admin-episodes-table"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              ...(f.obra
                ? []
                : [
                    {
                      key: "obra",
                      label: "Obra",
                      width: "22%",
                      render: (r: EpisodeRow) => (r.catalogEntryId ? <AdminButtonLink href={`/admin/obras/${r.catalogEntryId}`}><span lang={r.workTitleNative ? "ja" : undefined}>{r.workTitleNative ?? r.workTitle}</span></AdminButtonLink> : <span>{r.workTitleNative ?? r.workTitle}</span>),
                    },
                  ]),
              {
                key: "ep",
                label: "Episódio",
                width: "30%",
                render: (r) => (
                  <Box sx={{ minWidth: 0 }}>
                    <AdminButtonLink href={`/admin/episodios/${r.id}`}>
                      <span data-testid={`episode-link-${r.id}`}>{`EP${String(r.episode).padStart(2, "0")}${r.title ? ` · ${r.title}` : ""}`}</span>
                    </AdminButtonLink>
                    {r.titleJa && (
                      <Typography lang="ja" sx={{ fontSize: 13, color: "text.secondary", overflowWrap: "anywhere" }}>
                        {r.titleJa}
                      </Typography>
                    )}
                  </Box>
                ),
              },
              {
                key: "data",
                label: "Data",
                render: (r) => (
                  <span suppressHydrationWarning>
                    {r.airingAt ? fmtFull(new Date(r.airingAt), timeZone) : r.airDate ? `${dayLabel(r.airDate)} (só o dia)` : "Dados insuficientes"}
                    {r.overridden ? " · manual" : ""}
                  </span>
                ),
              },
              { key: "estado", label: "Situação", render: (r) => <span data-testid={`episode-state-${r.id}`}><SmallChip tone={STATE_TONE[r.state]}>{RELEASE_STATE_LABELS[r.state]}</SmallChip></span> },
              { key: "fonte", label: "Fonte", render: (r) => SOURCE_LABELS[r.source] ?? r.source },
              {
                key: "pend",
                label: "Dados",
                render: (r) => (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {!r.title && !r.titleJa && <SmallChip tone="warning">sem título</SmallChip>}
                    {!r.hasSynopsis && <SmallChip>sem sinopse</SmallChip>}
                    {r.manualFields.length > 0 && <SmallChip tone="accent">Manual</SmallChip>}
                  </Box>
                ),
              },
              { key: "upd", label: "Atualizado", render: (r) => <span suppressHydrationWarning>{fmtDate(new Date(r.updatedAt), timeZone)}</span> },
            ]}
          />
          <AdminPager basePath="/admin/episodios" params={params} page={page} pages={pages} total={total} pageSize={EPISODES_PAGE_SIZE} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Situação: &quot;Exibido&quot; vem da data (passou e não foi adiado nem cancelado); &quot;só o dia&quot; quando a fonte não informa o horário. &quot;manual&quot;: horário corrigido pelo admin.
          </Typography>
        </>
      )}
    </>
  );
}
