import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPager } from "@/components/admin/AdminPager";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { CalendarInvestigator } from "@/components/admin/CalendarInvestigator";
import { EmptyState } from "@/components/StatePanels";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";
import { EPISODE_SOURCES, EPISODE_STATE_FILTERS, EPISODES_PAGE_SIZE, loadEpisodesPage, parseEpisodesFilters, stateWhere, type EpisodeRow } from "@/lib/adminEpisodes";
import { RELEASE_STATE_LABELS, SOURCE_LABELS } from "@/lib/episodeState";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Admin → Calendário (Fase 5, §8): o que sai no período, em ordem cronológica e no horário efetivo (override aplicado);
 * adiados, sem data e divergências; o investigador "por que não apareceu?" e a releitura controlada da agenda.
 */
export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const sp = await searchParams;
  const now = new Date();
  // Padrão: de hoje a 7 dias (o que o calendário público mostra nesta semana).
  const f = { ...parseEpisodesFilters(sp), ordem: "data" as const };
  if (!f.de && !f.ate && !f.situacao) {
    f.de = isoDay(now);
    f.ate = isoDay(new Date(now.getTime() + 7 * DAY));
  }
  const [{ rows, total, page, pages }, postponed, undated, conflicts, overrides] = await Promise.all([
    loadEpisodesPage(f, now),
    prisma.airingScheduleEntry.count({ where: stateWhere("POSTPONED", now) }),
    prisma.airingScheduleEntry.count({ where: { ...stateWhere("UNKNOWN_DATE", now), catalogEntry: { is: { onPlatform: true, status: { in: ["RELEASING", "NOT_YET_RELEASED"] } } } } }),
    prisma.catalogConflict.count({ where: { status: "PENDING" } }),
    prisma.catalogOverride.count({ where: { removedAt: null } }),
  ]);
  // Duplicados no período: a mesma obra com dois episódios no mesmo instante (pode ser episódio duplo legítimo).
  const sameInstant = new Map<string, number>();
  for (const r of rows) if (r.airingAt) sameInstant.set(`${r.anilistId}-${r.airingAt}`, (sameInstant.get(`${r.anilistId}-${r.airingAt}`) ?? 0) + 1);
  const params = Object.fromEntries(Object.entries({ q: f.q, situacao: f.situacao, fonte: f.fonte, de: f.de, ate: f.ate }).filter(([, v]) => v)) as Record<string, string>;

  return (
    <>
      <AdminPageHeader title="Calendário" subtitle="O que sai no período, no horário efetivo (com os overrides). Episódio só com o dia ou sem data não entra no calendário público." />
      <StatGrid>
        <StatCard testId="calendar-admin-postponed" label="Adiados" value={postponed} hint={<AdminButtonLink href="/admin/calendario?situacao=POSTPONED">Ver adiados</AdminButtonLink>} />
        <StatCard testId="calendar-admin-undated" label="Sem data (obras no ar ou por estrear)" value={undated} hint={<AdminButtonLink href="/admin/calendario?situacao=UNKNOWN_DATE">Ver sem data</AdminButtonLink>} />
        <StatCard testId="calendar-admin-conflicts" label="Divergências entre fontes" value={conflicts} hint={<AdminButtonLink href="/admin/conflitos">Abrir conflitos</AdminButtonLink>} />
        <StatCard testId="calendar-admin-overrides" label="Horários manuais ativos" value={overrides} hint={<AdminButtonLink href="/admin/overrides">Abrir overrides</AdminButtonLink>} />
      </StatGrid>

      <AdminPanel title="Por que não apareceu na agenda?" testId="calendar-admin-investigator">
        <CalendarInvestigator />
      </AdminPanel>

      <AdminFilters
        fields={[
          { kind: "search", name: "q", label: "Obra ou episódio", placeholder: "Título ou AniList ID", value: f.q },
          { kind: "search", name: "de", label: "De (AAAA-MM-DD)", placeholder: isoDay(now), value: f.de },
          { kind: "search", name: "ate", label: "Até (AAAA-MM-DD)", placeholder: isoDay(new Date(now.getTime() + 7 * DAY)), value: f.ate },
          { kind: "select", name: "situacao", label: "Situação", value: f.situacao, width: 200, options: [{ value: "", label: "Todas" }, ...EPISODE_STATE_FILTERS.map((s) => ({ value: s, label: RELEASE_STATE_LABELS[s] }))] },
          { kind: "select", name: "fonte", label: "Fonte", value: f.fonte, width: 170, options: [{ value: "", label: "Todas" }, ...EPISODE_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))] },
        ]}
      />

      {rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="calendar-admin-empty" icon={<EventBusyOutlinedIcon />} title="Nada no período.">
            Amplie o período ou tire um filtro. Para uma obra específica, use o investigador acima.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <AdminTable<EpisodeRow>
            caption={`Lançamentos (${total.toLocaleString("pt-BR")})`}
            testId="calendar-admin-table"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "quando",
                label: "Quando",
                render: (r) => (
                  <span suppressHydrationWarning>
                    {r.airingAt ? fmtFull(new Date(r.airingAt), timeZone) : r.airDate ? `${r.airDate} (só o dia)` : "Dados insuficientes"}
                  </span>
                ),
              },
              { key: "obra", label: "Obra", width: "30%", render: (r) => (r.catalogEntryId ? <AdminButtonLink href={`/admin/obras/${r.catalogEntryId}`}><span lang={r.workTitleNative ? "ja" : undefined}>{r.workTitleNative ?? r.workTitle}</span></AdminButtonLink> : (r.workTitleNative ?? r.workTitle)) },
              { key: "ep", label: "Episódio", render: (r) => <AdminButtonLink href={`/admin/episodios/${r.id}`}><span data-testid={`calendar-admin-ep-${r.id}`}>{`EP${String(r.episode).padStart(2, "0")}${r.title ? ` · ${r.title}` : ""}`}</span></AdminButtonLink> },
              { key: "estado", label: "Situação", render: (r) => <SmallChip tone={r.state === "SCHEDULED" ? "accent" : r.state === "AIRED" ? "success" : "warning"}>{RELEASE_STATE_LABELS[r.state]}</SmallChip> },
              {
                key: "sinais",
                label: "Sinais",
                render: (r) => (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {r.overridden && <SmallChip tone="accent">horário manual</SmallChip>}
                    {r.airingAt && (sameInstant.get(`${r.anilistId}-${r.airingAt}`) ?? 0) > 1 && <SmallChip tone="warning">mesmo horário de outro episódio</SmallChip>}
                  </Box>
                ),
              },
              { key: "fonte", label: "Fonte", render: (r) => SOURCE_LABELS[r.source] ?? r.source },
            ]}
          />
          <AdminPager basePath="/admin/calendario" params={params} page={page} pages={pages} total={total} pageSize={EPISODES_PAGE_SIZE} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Cada episódio abre o detalhe com o histórico de datas (da fonte e do admin), o override e os avisos.
          </Typography>
        </>
      )}
    </>
  );
}
