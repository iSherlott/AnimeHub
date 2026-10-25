import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { WorkEditForm, type EditableValues } from "@/components/admin/WorkEditForm";
import { WorkVisibilityControl } from "@/components/admin/WorkVisibilityControl";
import { fmtDate, fmtFull, requireAdminPage } from "@/lib/adminPage";
import { FIELD_LABELS, FORMATS, STATUSES } from "@/lib/catalogEdit";
import { ISSUE_LABELS } from "@/lib/curation/issues";
import { KINDS, KIND_LABELS } from "@/lib/curation/kind";
import { activeGenreKeys } from "@/lib/genres";
import { ADULT_GENRE } from "@/lib/contentPolicy";
import { loadWorkDetail } from "@/lib/workDetail";
import { SEASON_LABEL, STATUS_LABEL } from "@/lib/workLabels";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const value = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") || "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const ORIGIN_LABEL: Record<string, string> = { ADMIN: "Admin", IMPORT: "Importação", CURATION: "Curadoria", JOB: "Job", SYSTEM: "Sistema", SOURCE: "Fonte" };

/** Admin → Catálogo de obras → detalhe (Fase 3): identificação, metadados, franquia, episódios, cópias, curadoria e histórico. */
export default async function AdminWorkDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const historyPage = Math.max(0, Number((await searchParams).historico) || 0);
  const [detail, genreKeys] = await Promise.all([loadWorkDetail((await params).id, historyPage), activeGenreKeys()]);
  if (!detail) notFound();
  const { entry, episodes } = detail;
  const openIssues = detail.issues.filter((i) => i.status === "OPEN");

  const initial: EditableValues = {
    titleRomaji: entry.titleRomaji,
    titleEnglish: entry.titleEnglish ?? "",
    titleNative: entry.titleNative ?? "",
    description: entry.description ?? "",
    descriptionPt: entry.descriptionPt ?? "",
    format: entry.format ?? "",
    kind: entry.kind ?? "",
    status: entry.status ?? "",
    episodes: entry.episodes !== null ? String(entry.episodes) : "",
    season: entry.season ?? "",
    seasonYear: entry.seasonYear !== null ? String(entry.seasonYear) : "",
    startDate: day(entry.startDate),
    endDate: day(entry.endDate),
    genres: (entry.genres ?? "").split(",").filter(Boolean),
    coverImage: entry.coverImage ?? "",
    bannerImage: entry.bannerImage ?? "",
    officialSite: entry.officialSite ?? "",
  };

  const facts: Array<[string, string]> = [
    ["AniList", entry.anilistId !== null ? String(entry.anilistId) : "—"],
    ["AniDB", entry.anidbId !== null ? String(entry.anidbId) : "—"],
    ["Kitsu", entry.kitsuId !== null ? String(entry.kitsuId) : "—"],
    ["MAL", entry.malId !== null ? String(entry.malId) : "—"],
    ["Fonte principal", entry.source],
    ["Formato · tipo", [entry.format, entry.kind ? KIND_LABELS[entry.kind as keyof typeof KIND_LABELS] ?? entry.kind : null].filter(Boolean).join(" · ") || "—"],
    ["Situação", entry.status ? STATUS_LABEL[entry.status] ?? entry.status : "—"],
    ["Época", [entry.season ? SEASON_LABEL[entry.season] : null, entry.seasonYear].filter(Boolean).join(" ") || "—"],
    ["Estreia · fim", `${day(entry.startDate) || "—"} · ${day(entry.endDate) || "—"}`],
    ["Gêneros", entry.genres?.split(",").join(", ") || "—"],
    ["Atraso do streaming", entry.streamingDelayMinutes ? `${entry.streamingSite ?? "Streaming"} · ${entry.streamingDelayMinutes} min` : "—"],
    ["Curada em", entry.curatedAt ? fmtFull(entry.curatedAt, timeZone) : "—"],
  ];

  return (
    <>
      <AdminPageHeader
        title={entry.titleNative ?? entry.titleRomaji}
        subtitle={[entry.titleNative ? entry.titleRomaji : null, entry.titleEnglish].filter(Boolean).join(" · ") || undefined}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {entry.anilistId !== null && entry.onPlatform && <AdminButtonLink href={`/anime/${entry.anilistId}`}>Página pública</AdminButtonLink>}
            <WorkVisibilityControl id={entry.id} onPlatform={entry.onPlatform} />
          </Box>
        }
      />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }} data-testid="work-detail-chips">
        <SmallChip tone={entry.onPlatform ? "success" : "neutral"}>{entry.onPlatform ? "Na plataforma" : "Fora da plataforma (cache)"}</SmallChip>
        {entry.manualFields.length > 0 && <SmallChip tone="accent">Manual: {entry.manualFields.map((f) => FIELD_LABELS[f as keyof typeof FIELD_LABELS] ?? f).join(", ")}</SmallChip>}
        {openIssues.length > 0 && <SmallChip tone="warning">{openIssues.length} pendência(s)</SmallChip>}
        {detail.overrides > 0 && <SmallChip>{detail.overrides} horário(s) manual(is)</SmallChip>}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Identificação e ficha" testId="work-detail-facts">
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.75, fontSize: 14 }}>
            {facts.map(([k, v]) => (
              <Box key={k} sx={{ display: "contents" }}>
                <Box component="dt" sx={{ color: "text.secondary" }}>{k}</Box>
                <Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>{v}</Box>
              </Box>
            ))}
          </Box>
        </AdminPanel>

        <AdminPanel title="Episódios e lançamentos" testId="work-detail-episodes">
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.75, fontSize: 14 }}>
            <Box component="dt" sx={{ color: "text.secondary" }}>Informado pela fonte</Box>
            <Box component="dd" sx={{ m: 0 }} data-testid="episodes-informed">{episodes.informed ?? "Dados insuficientes"}</Box>
            <Box component="dt" sx={{ color: "text.secondary" }}>Cadastrados (calculado)</Box>
            <Box component="dd" sx={{ m: 0 }} data-testid="episodes-registered">{episodes.registered}</Box>
            <Box component="dt" sx={{ color: "text.secondary" }}>Já exibidos (calculado)</Box>
            <Box component="dd" sx={{ m: 0 }} data-testid="episodes-aired">{episodes.aired}</Box>
            <Box component="dt" sx={{ color: "text.secondary" }}>Futuros com data (calculado)</Box>
            <Box component="dd" sx={{ m: 0 }} data-testid="episodes-upcoming">{episodes.upcoming}</Box>
            <Box component="dt" sx={{ color: "text.secondary" }}>Sem data ou adiados (calculado)</Box>
            <Box component="dd" sx={{ m: 0 }} data-testid="episodes-undated">{episodes.undated}</Box>
            {episodes.cancelled > 0 && (
              <>
                <Box component="dt" sx={{ color: "text.secondary" }}>Cancelados</Box>
                <Box component="dd" sx={{ m: 0 }}>{episodes.cancelled}</Box>
              </>
            )}
            <Box component="dt" sx={{ color: "text.secondary" }}>Com título / sinopse</Box>
            <Box component="dd" sx={{ m: 0 }} data-testid="episodes-content">{`${episodes.withTitle} / ${episodes.withSynopsis}`}</Box>
            <Box component="dt" sx={{ color: "text.secondary" }}>Próximo</Box>
            <Box component="dd" sx={{ m: 0 }} suppressHydrationWarning data-testid="episodes-next">
              {episodes.next ? `Ep. ${episodes.next.episode} · ${episodes.next.exact ? fmtFull(new Date(episodes.next.at), timeZone) : `${new Date(episodes.next.at).toISOString().slice(0, 10)} (só o dia)`}` : "Dados insuficientes"}
            </Box>
            <Box component="dt" sx={{ color: "text.secondary" }}>Último exibido</Box>
            <Box component="dd" sx={{ m: 0 }} suppressHydrationWarning>{episodes.lastAired ? `Ep. ${episodes.lastAired.episode} · ${fmtFull(new Date(episodes.lastAired.at), timeZone)}` : "—"}</Box>
          </Box>
          {episodes.divergence && <Typography sx={{ fontSize: 14, color: "warning.main" }} data-testid="episodes-divergence">{episodes.divergence}</Typography>}
          <AdminButtonLink href={`/admin/episodios?obra=${entry.id}`}>Ver episódios</AdminButtonLink>
        </AdminPanel>
      </Box>

      <AdminPanel title="Editar a obra" testId="work-detail-edit">
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          Valores da fonte e da curadoria aparecem aqui como estão hoje; os marcados &quot;manual&quot; foram corrigidos à mão e a importação não os altera.
        </Typography>
        <WorkEditForm
          id={entry.id}
          updatedAt={entry.updatedAt.toISOString()}
          initial={initial}
          manualFields={entry.manualFields}
          options={{
            formats: FORMATS,
            kinds: KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
            statuses: STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s })),
            seasons: Object.entries(SEASON_LABEL).map(([v, l]) => ({ value: v, label: l })),
            genres: [...new Set([...genreKeys, ADULT_GENRE])],
            labels: FIELD_LABELS,
          }}
        />
      </AdminPanel>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 3, alignItems: "start" }}>
        <AdminPanel title="Franquia e cronologia" testId="work-detail-franchise">
          {detail.franchise.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>A obra não está em nenhuma linha do tempo (série sem relações ou ainda não auditada).</Typography>
          ) : (
            <AdminTable
              caption="Linha do tempo da franquia"
              rows={detail.franchise}
              rowKey={(r) => r.id}
              columns={[
                { key: "o", label: "#", render: (r) => r.timelineOrder ?? "—" },
                { key: "t", label: "Obra", render: (r) => (r.id === entry.id ? <strong>{r.titleNative ?? r.titleRomaji}</strong> : <AdminButtonLink href={`/admin/obras/${r.id}`}>{r.titleNative ?? r.titleRomaji}</AdminButtonLink>) },
                { key: "k", label: "Papel", render: (r) => [r.timelineRole, r.timelineSeason ? `temporada ${r.timelineSeason}` : null].filter(Boolean).join(" · ") || "—" },
                { key: "y", label: "Ano", render: (r) => r.seasonYear ?? "—" },
              ]}
            />
          )}
          {entry.franchiseKey !== null && <AdminButtonLink href={`/admin/franquias/${entry.franchiseKey}`}>Editar a ordem da franquia</AdminButtonLink>}
          {detail.story.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 3, fontSize: 14 }}>
              {detail.story.map((s) => (
                <li key={`${s.role}-${s.other.anilistId}`}>
                  {s.role === "REBOOT" ? "Reboot de" : "Refeita em"} {s.other.id ? <AdminButtonLink href={`/admin/obras/${s.other.id}`}>{s.other.title}</AdminButtonLink> : s.other.title}
                </li>
              ))}
            </Box>
          )}
        </AdminPanel>

        <AdminPanel title="Cópias da obra" testId="work-detail-copies">
          <Typography sx={{ fontSize: 14 }}>
            {detail.productions.length} página(s) pública(s) · {detail.followers} item(ns) de lista
          </Typography>
          {detail.productions.map((p) => (
            <Typography key={p.id} sx={{ fontSize: 14, color: p.diverging.length ? "warning.main" : "text.secondary" }}>
              Página pública ({p.franchiseName}, temporada {p.seasonNumber}): {p.diverging.length ? `diverge em ${p.diverging.map((f) => FIELD_LABELS[f as keyof typeof FIELD_LABELS] ?? f).join(", ")}` : "igual à obra"}
            </Typography>
          ))}
          {Object.keys(detail.listDiverging).length > 0 && (
            <Typography sx={{ fontSize: 14, color: "warning.main" }}>
              Listas divergem em: {Object.entries(detail.listDiverging).map(([f, n]) => `${FIELD_LABELS[f as keyof typeof FIELD_LABELS] ?? f} (${n})`).join(", ")}. Salvar o campo na obra leva o valor às cópias.
            </Typography>
          )}
          {detail.translations.length > 0 && (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              Traduções: {detail.translations.map((t) => `${t.lang} (${t.source === "manual" ? "manual" : `automática, ${t.source}`})`).join(", ")}
            </Typography>
          )}
        </AdminPanel>
      </Box>

      <AdminPanel title="Pendências de curadoria" testId="work-detail-issues">
        {detail.issues.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma pendência registrada para esta obra.</Typography>
        ) : (
          <AdminTable
            caption="Pendências"
            rows={detail.issues}
            rowKey={(i) => i.id}
            columns={[
              { key: "c", label: "Pendência", render: (i) => ISSUE_LABELS[i.code as keyof typeof ISSUE_LABELS]?.title ?? i.code },
              { key: "d", label: "Detalhe", render: (i) => i.detail ?? "—" },
              { key: "s", label: "Estado", render: (i) => (i.status === "OPEN" ? <SmallChip tone="warning">Aberta</SmallChip> : <SmallChip>{i.status === "RESOLVED" ? "Resolvida" : "Dispensada"}</SmallChip>) },
              { key: "u", label: "Atualizada", render: (i) => <span suppressHydrationWarning>{fmtDate(new Date(i.updatedAt), timeZone)}</span> },
            ]}
          />
        )}
      </AdminPanel>

      <AdminPanel title="Histórico de alterações" testId="work-detail-history">
        {detail.history.rows.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma alteração registrada desde a Fase 2 (histórico estruturado).</Typography>
        ) : (
          <>
            <AdminTable
              caption="Alterações"
              rows={detail.history.rows}
              rowKey={(r) => r.id}
              columns={[
                { key: "t", label: "Quando", render: (r) => <span suppressHydrationWarning>{fmtFull(new Date(r.at), timeZone)}</span> },
                { key: "o", label: "Origem", render: (r) => [ORIGIN_LABEL[r.origin] ?? r.origin, r.actorName].filter(Boolean).join(" · ") },
                { key: "f", label: "Campo", render: (r) => FIELD_LABELS[r.field as keyof typeof FIELD_LABELS] ?? r.field },
                { key: "b", label: "Antes", render: (r) => <span style={{ overflowWrap: "anywhere" }}>{value(r.before).slice(0, 200)}</span> },
                { key: "a", label: "Depois", render: (r) => <span style={{ overflowWrap: "anywhere" }}>{value(r.after).slice(0, 200)}</span> },
                { key: "r", label: "Motivo", render: (r) => r.reason ?? "—" },
              ]}
            />
            <Box sx={{ display: "flex", gap: 1 }}>
              {historyPage > 0 && <AdminButtonLink href={`/admin/obras/${entry.id}?historico=${historyPage - 1}`}>Mais recentes</AdminButtonLink>}
              {(historyPage + 1) * 30 < detail.history.total && <AdminButtonLink href={`/admin/obras/${entry.id}?historico=${historyPage + 1}`}>Mais antigas</AdminButtonLink>}
            </Box>
          </>
        )}
      </AdminPanel>
    </>
  );
}
