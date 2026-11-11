import { Box, Typography } from "@mui/material";
import { AdminPageHeader, AdminPanel, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { requireAdminPage } from "@/lib/adminPage";
import { usageStats } from "@/lib/usageStats";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Admin → Uso da rede (12/11/2026): números somados, sem dizer quem fez o quê. Ver src/lib/usageStats.ts. */
export default async function AdminUsagePage() {
  const { timeZone } = await requireAdminPage("admin");
  const stats = await usageStats(new Date(), timeZone);
  const [week, month] = stats.windows;
  const max = Math.max(1, ...stats.daily.map((d) => d.posts + d.comments + d.likes));
  return (
    <>
      <AdminPageHeader title="Uso da rede" subtitle="O que as pessoas de fato usam. Só números somados: nada aqui diz quem fez o quê." />
      <StatGrid>
        <StatCard testId="usage-active-7" label="Pessoas ativas · 7 dias" value={fmt(week.activePeople)} hint={`de ${fmt(stats.accounts)} contas · ${fmt(month.activePeople)} em 30 dias`} />
        <StatCard testId="usage-posts-7" label="Publicações · 7 dias" value={fmt(week.posts)} hint={`${fmt(month.posts)} em 30 dias (sem o NewsHub)`} />
        <StatCard testId="usage-comments-7" label="Comentários · 7 dias" value={fmt(week.comments)} hint={`${fmt(week.likes)} curtidas na semana`} />
        <StatCard testId="usage-list-7" label="Listas mexidas · 7 dias" value={fmt(week.listChanges)} hint={`${fmt(week.episodeReactions)} reações a episódios · ${fmt(week.newAccounts)} contas novas`} />
      </StatGrid>

      <AdminPanel title="Atividade por dia (14 dias)" testId="usage-daily">
        <Box role="img" aria-label="Publicações, comentários e curtidas por dia nos últimos 14 dias" sx={{ display: "grid", gridTemplateColumns: "repeat(14, minmax(0,1fr))", gap: { xs: 0.5, sm: 1 }, alignItems: "end", height: 160 }}>
          {stats.daily.map((d) => {
            const total = d.posts + d.comments + d.likes;
            return (
              <Box key={d.day} title={`${d.day}: ${d.posts} publicações, ${d.comments} comentários, ${d.likes} curtidas`} sx={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: "2px" }}>
                <Box sx={{ height: `${(d.likes / max) * 100}%`, bgcolor: "rgba(255,255,255,0.18)", borderRadius: "3px 3px 0 0" }} />
                <Box sx={{ height: `${(d.comments / max) * 100}%`, bgcolor: "secondary.main" }} />
                <Box sx={{ height: `${(d.posts / max) * 100}%`, bgcolor: "primary.main", borderRadius: total === d.posts ? "3px 3px 0 0" : 0 }} />
              </Box>
            );
          })}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(14, minmax(0,1fr))", gap: { xs: 0.5, sm: 1 } }}>
          {stats.daily.map((d) => (
            <Typography key={d.day} sx={{ fontSize: 10, color: "text.secondary", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
              {d.day.slice(8)}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", fontSize: 12, color: "text.secondary" }}>
          <span>■ <Box component="span" sx={{ color: "primary.main" }}>publicações</Box></span>
          <span>■ <Box component="span" sx={{ color: "secondary.main" }}>comentários</Box></span>
          <span>■ curtidas</span>
        </Box>
      </AdminPanel>

      <AdminPanel title="Recursos" testId="usage-features">
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" }, columnGap: 4 }}>
          {stats.features.map((f) => (
            <Box component="li" key={f.label} data-testid="usage-feature" sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{f.label}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{f.hint}</Typography>
              </Box>
              <Typography sx={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{fmt(f.value)}</Typography>
            </Box>
          ))}
        </Box>
      </AdminPanel>
    </>
  );
}
