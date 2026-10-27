import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { EpisodeEditForm, type EpisodeFormValues } from "@/components/admin/EpisodeEditForm";
import { fmtFull, requireAdminPage, toLocalInput } from "@/lib/adminPage";
import { loadEpisodeDetail } from "@/lib/adminEpisodes";
import { EPISODE_FIELD_LABELS } from "@/lib/episodeEdit";
import { CERTAINTY_LABELS, EPISODE_STATUSES, RELEASE_STATE_LABELS, SOURCE_LABELS, type DateCertainty } from "@/lib/episodeState";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = { ACTIVE: "Normal", POSTPONED: "Adiado", CANCELLED: "Cancelado" };
const ORIGIN_LABEL: Record<string, string> = { ADMIN: "Admin", IMPORT: "Importação", CURATION: "Curadoria", JOB: "Job", SYSTEM: "Sistema", SOURCE: "Fonte" };
const LABELS: Record<string, string> = { ...EPISODE_FIELD_LABELS, override: "Horário manual (override)", manualFields: "Campos protegidos", dateCertainty: "Certeza da data" };
const value = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") || "—" : String(v));

/** Admin → Episódios → detalhe (Fase 4): o episódio global, a data efetiva e de onde veio, duplicados possíveis, edição e histórico. */
export default async function AdminEpisodeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const historyPage = Math.max(0, Number((await searchParams).historico) || 0);
  const detail = await loadEpisodeDetail((await params).id, historyPage);
  if (!detail) notFound();
  const { row, work, override } = detail;
  const effective = override ? new Date(override.value) : row.airingAt;

  const initial: EpisodeFormValues = {
    episodeTitle: row.episodeTitle ?? "",
    episodeTitleEn: row.episodeTitleEn ?? "",
    episodeTitleJa: row.episodeTitleJa ?? "",
    synopsis: row.synopsis ?? "",
    thumbnail: row.thumbnail ?? "",
    status: row.status,
    dateMode: effective ? "exact" : row.airDate ? "day" : "unknown",
    local: effective ? toLocalInput(effective, timeZone) : "",
    airDate: row.airDate ? row.airDate.toISOString().slice(0, 10) : "",
    episode: String(row.episode),
    workId: row.catalogEntryId ?? "",
  };

  const facts: Array<[string, React.ReactNode]> = [
    ["Obra", work ? <AdminButtonLink key="w" href={`/admin/obras/${work.id}`}>{work.titleNative ?? work.titleRomaji}</AdminButtonLink> : `AniList ${row.anilistId} (fora do catálogo)`],
    ["AniList ID da obra", String(row.anilistId)],
    ["Número", `${row.episode}${work?.episodes ? ` de ${work.episodes} informados pela fonte` : ""}`],
    ["Situação", RELEASE_STATE_LABELS[detail.state]],
    ["Data efetiva", effective ? fmtFull(effective, timeZone) : row.airDate ? `${row.airDate.toISOString().slice(0, 10)} (só o dia, horário desconhecido)` : "Dados insuficientes"],
    ["Certeza da data", CERTAINTY_LABELS[row.dateCertainty as DateCertainty] ?? row.dateCertainty],
    ["Fonte do registro", SOURCE_LABELS[row.source] ?? row.source],
    ["Última leitura da fonte", fmtFull(row.fetchedAt, timeZone)],
    ["Atualizado", fmtFull(row.updatedAt, timeZone)],
    [
      "Avisos emitidos",
      detail.alerts.total
        ? `${detail.alerts.total} pessoa(s)${detail.alerts.rescheduled ? ` · ${detail.alerts.rescheduled} de data alterada` : ""} · ${detail.alerts.seen} visto(s) · último em ${fmtFull(new Date(detail.alerts.lastAt as string), timeZone)}`
        : "nenhum (o sino avisa quem acompanha no dia do lançamento)",
    ],
  ];

  return (
    <>
      <AdminPageHeader
        title={`EP${String(row.episode).padStart(2, "0")}${row.episodeTitleJa || row.episodeTitle ? ` · ${row.episodeTitleJa ?? row.episodeTitle}` : ""}`}
        subtitle={[row.titleNative ?? row.titleRomaji, row.episodeTitleJa ? row.episodeTitle : null, row.episodeTitleEn].filter(Boolean).join(" · ") || undefined}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {detail.neighbors.previous && <AdminButtonLink href={`/admin/episodios/${detail.neighbors.previous.id}`}>{`← EP${detail.neighbors.previous.episode}`}</AdminButtonLink>}
            {detail.neighbors.next && <AdminButtonLink href={`/admin/episodios/${detail.neighbors.next.id}`}>{`EP${detail.neighbors.next.episode} →`}</AdminButtonLink>}
            {work && <AdminButtonLink href={`/admin/episodios?obra=${work.id}`}>Todos da obra</AdminButtonLink>}
          </Box>
        }
      />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }} data-testid="episode-detail-chips">
        <SmallChip tone={detail.state === "AIRED" ? "success" : detail.state === "SCHEDULED" ? "accent" : "warning"}>{RELEASE_STATE_LABELS[detail.state]}</SmallChip>
        {row.manualFields.length > 0 && <SmallChip tone="accent">Manual: {row.manualFields.map((f) => LABELS[f] ?? f).join(", ")}</SmallChip>}
        {override && <SmallChip>Horário manual (override)</SmallChip>}
        {detail.duplicates.length > 0 && <SmallChip tone="warning">{detail.duplicates.length} possível(is) duplicado(s)</SmallChip>}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Episódio" testId="episode-detail-facts">
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.75, fontSize: 14 }}>
            {facts.map(([k, v]) => (
              <Box key={k} sx={{ display: "contents" }}>
                <Box component="dt" sx={{ color: "text.secondary" }}>{k}</Box>
                <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>{v}</Box>
              </Box>
            ))}
          </Box>
          {row.synopsis && <Typography sx={{ fontSize: 14, color: "text.secondary", whiteSpace: "pre-line" }}>{row.synopsis}</Typography>}
        </AdminPanel>

        <AdminPanel title="Data: fonte e correção" testId="episode-detail-dates">
          {override ? (
            <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.75, fontSize: 14 }}>
              <Box component="dt" sx={{ color: "text.secondary" }}>Valor da fonte ({override.originalSource})</Box>
              <Box component="dd" sx={{ m: 0 }} suppressHydrationWarning data-testid="episode-override-original">{row.airingAt ? fmtFull(row.airingAt, timeZone) : "—"}</Box>
              <Box component="dt" sx={{ color: "text.secondary" }}>Valor manual</Box>
              <Box component="dd" sx={{ m: 0 }} suppressHydrationWarning data-testid="episode-override-value">{fmtFull(new Date(override.value), timeZone)}</Box>
              <Box component="dt" sx={{ color: "text.secondary" }}>Motivo</Box>
              <Box component="dd" sx={{ m: 0 }}>{`${override.reason || "—"} · ${override.adminName}`}</Box>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              {row.manualFields.includes("airingAt") || row.manualFields.includes("airDate") ? "A data foi definida pelo admin e está protegida contra as fontes." : "A data é a da fonte, sem correção manual."}
            </Typography>
          )}
          <AdminButtonLink href="/admin/overrides">Overrides de horário</AdminButtonLink>
        </AdminPanel>
      </Box>

      {detail.duplicates.length > 0 && (
        <AdminPanel title="Possíveis duplicados na mesma obra" testId="episode-detail-duplicates">
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {detail.duplicates.map((d) => (
              <li key={d.id}>
                <AdminButtonLink href={`/admin/episodios/${d.id}`}>{`EP${d.episode}`}</AdminButtonLink> — {d.reason}
              </li>
            ))}
          </Box>
        </AdminPanel>
      )}

      <AdminPanel title="Editar o episódio" testId="episode-detail-edit">
        <EpisodeEditForm
          id={row.id}
          updatedAt={row.updatedAt.toISOString()}
          initial={initial}
          manualFields={row.manualFields}
          timeZone={timeZone}
          labels={LABELS}
          statuses={EPISODE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
      </AdminPanel>

      <AdminPanel title="Histórico de alterações e de datas" testId="episode-detail-history">
        {detail.history.rows.length === 0 && detail.overridesHistory.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma alteração registrada.</Typography>
        ) : (
          <>
            {detail.history.rows.length > 0 && (
              <AdminTable
                caption="Alterações"
                rows={detail.history.rows}
                rowKey={(r) => r.id}
                columns={[
                  { key: "t", label: "Quando", render: (r) => <span suppressHydrationWarning>{fmtFull(new Date(r.at), timeZone)}</span> },
                  { key: "o", label: "Origem", render: (r) => [ORIGIN_LABEL[r.origin] ?? r.origin, r.actorName].filter(Boolean).join(" · ") },
                  { key: "f", label: "Campo", render: (r) => LABELS[r.field] ?? r.field },
                  { key: "b", label: "Antes", render: (r) => <span style={{ overflowWrap: "anywhere" }}>{value(r.before).slice(0, 200)}</span> },
                  { key: "a", label: "Depois", render: (r) => <span style={{ overflowWrap: "anywhere" }}>{value(r.after).slice(0, 200)}</span> },
                  { key: "r", label: "Motivo", render: (r) => r.reason ?? "—" },
                ]}
              />
            )}
            {detail.overridesHistory.length > 0 && (
              <AdminTable
                caption="Overrides de horário"
                rows={detail.overridesHistory}
                rowKey={(r) => r.id}
                columns={[
                  { key: "t", label: "Criado", render: (r) => <span suppressHydrationWarning>{`${fmtFull(new Date(r.createdAt), timeZone)} · ${r.adminName}`}</span> },
                  { key: "o", label: "Fonte → manual", render: (r) => <span suppressHydrationWarning>{`${fmtFull(new Date(r.originalValue), timeZone)} → ${fmtFull(new Date(r.value), timeZone)}`}</span> },
                  { key: "r", label: "Motivo", render: (r) => r.reason || "—" },
                  { key: "s", label: "Estado", render: (r) => (r.removedAt ? `removido · ${r.removedByName ?? ""}` : "ativo") },
                ]}
              />
            )}
            <Box sx={{ display: "flex", gap: 1 }}>
              {historyPage > 0 && <AdminButtonLink href={`/admin/episodios/${row.id}?historico=${historyPage - 1}`}>Mais recentes</AdminButtonLink>}
              {(historyPage + 1) * 30 < detail.history.total && <AdminButtonLink href={`/admin/episodios/${row.id}?historico=${historyPage + 1}`}>Mais antigas</AdminButtonLink>}
            </Box>
          </>
        )}
      </AdminPanel>
    </>
  );
}
