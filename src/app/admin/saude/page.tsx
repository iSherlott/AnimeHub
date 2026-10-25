import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { LinkCatalogButton } from "@/components/admin/LinkCatalogButton";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";
import { loadCatalogHealth, type HealthIndicator } from "@/lib/catalogHealth";

export const dynamic = "force-dynamic";

const TONE_COLOR: Record<HealthIndicator["tone"], string> = { ok: "success.main", warning: "warning.main", critical: "error.main", info: "text.secondary" };
const TONE_LABEL: Record<HealthIndicator["tone"], string> = { ok: "ok", warning: "atenção", critical: "crítico", info: "informativo" };

/**
 * Admin → Saúde do catálogo (Fase 3, §5): o que precisa de atenção, em ordem de impacto, com cada número levando à lista
 * filtrada; mais as atividades recentes (histórico estruturado e eventos) e os processos em andamento.
 */
export default async function AdminHealthPage() {
  const { timeZone } = await requireAdminPage("catalog");
  const [{ groups, totals, integrity }, recentChanges, recentLogs, running] = await Promise.all([
    loadCatalogHealth(),
    prisma.changeLog.findMany({ orderBy: { at: "desc" }, take: 10 }),
    prisma.adminLog.findMany({ orderBy: { at: "desc" }, take: 10 }),
    prisma.adminJob.findMany({ where: { state: "RUNNING" }, orderBy: { seq: "desc" }, take: 10 }),
  ]);
  const unlinked = integrity.filter((c) => c.key.endsWith("_unlinked")).reduce((n, c) => n + c.count, 0);

  return (
    <>
      <AdminPageHeader title="Saúde do catálogo" subtitle="O que precisa de atenção, em ordem de impacto. Números contados agora no banco; cada um leva à lista filtrada." />
      <StatGrid>
        <StatCard testId="health-total" label="Obras no catálogo" value={totals.catalog.toLocaleString("pt-BR")} />
        <StatCard testId="health-platform" label="Na plataforma" value={totals.onPlatform.toLocaleString("pt-BR")} hint={<AdminButtonLink href="/admin/obras">Abrir catálogo</AdminButtonLink>} />
        <StatCard testId="health-cache" label="Só cache de busca" value={totals.cache.toLocaleString("pt-BR")} hint="invisíveis; o admin traz quando quiser" />
      </StatGrid>

      {groups.map((group) => (
        <AdminPanel key={group.key} title={group.title} testId={`health-group-${group.key}`}>
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
            {group.indicators.map((ind) => (
              <Box component="li" key={ind.key} data-testid={`health-${ind.key}`} data-tone={ind.tone} sx={{ display: "flex", justifyContent: "space-between", gap: 2, p: 1.5, borderRadius: "10px", border: 1, borderColor: "divider" }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{ind.label}</Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{ind.definition}</Typography>
                </Box>
                <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: TONE_COLOR[ind.tone] }} data-testid={`health-${ind.key}-count`}>
                    {ind.key === "loader" ? (ind.count < 0 ? "—" : `${ind.count} min`) : ind.count.toLocaleString("pt-BR")}
                  </Typography>
                  <Typography sx={{ fontSize: 11, textTransform: "uppercase", color: TONE_COLOR[ind.tone] }}>{TONE_LABEL[ind.tone]}</Typography>
                  {ind.href && ind.count !== 0 && <AdminButtonLink href={ind.href}>Ver</AdminButtonLink>}
                </Box>
              </Box>
            ))}
          </Box>
          {group.key === "public" && unlinked > 0 && <LinkCatalogButton />}
        </AdminPanel>
      ))}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Alterações recentes" testId="health-recent-changes">
          {recentChanges.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma alteração registrada ainda.</Typography>
          ) : (
            <AdminTable
              caption="Alterações recentes"
              rows={recentChanges}
              rowKey={(r) => r.id}
              columns={[
                { key: "t", label: "Quando", render: (r) => <span suppressHydrationWarning>{fmtFull(r.at, timeZone)}</span> },
                { key: "e", label: "Registro", render: (r) => (r.catalogEntryId ? <AdminButtonLink href={`/admin/obras/${r.catalogEntryId}`}>{`${r.entity} · ${r.field}`}</AdminButtonLink> : `${r.entity} · ${r.field}`) },
                { key: "a", label: "Quem", render: (r) => [r.origin, r.actorName].filter(Boolean).join(" · ") },
              ]}
            />
          )}
        </AdminPanel>
        <AdminPanel title="Processos em andamento e eventos" testId="health-running">
          {running.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum processo rodando agora.</Typography>
          ) : (
            running.map((j) => (
              <AdminButtonLink key={j.seq} href={`/admin/jobs/${j.seq}`}>{`#${j.seq} · ${j.kind} · ${j.progressNote ?? j.stage}`}</AdminButtonLink>
            ))
          )}
          <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 13, color: "text.secondary" }}>
            {recentLogs.map((l) => (
              <li key={l.id} suppressHydrationWarning>
                {fmtFull(l.at, timeZone)} · {l.event} · {l.message}
              </li>
            ))}
          </Box>
        </AdminPanel>
      </Box>
    </>
  );
}
