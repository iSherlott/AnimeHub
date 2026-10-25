import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { CorrespondenceActions } from "@/components/admin/CorrespondenceActions";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";
import { correspondenceImpact, DIVERGENCES, loadCorrespondence, type CorrespondenceKind, type Side } from "@/lib/correspondences";

export const dynamic = "force-dynamic";

const ROWS: Array<[string, (s: Side) => string]> = [
  ["Título japonês", (s) => s.titleNative ?? "—"],
  ["Rōmaji", (s) => s.titleRomaji ?? "—"],
  ["Título internacional", (s) => s.titleEnglish ?? "—"],
  ["Ano", (s) => (s.year !== null ? String(s.year) : "—")],
  ["Formato", (s) => s.format ?? "—"],
  ["Episódios", (s) => (s.episodes !== null ? String(s.episodes) : "—")],
  ["Franquia", (s) => s.franchise ?? "—"],
  ["Identificadores", (s) => Object.entries(s.ids).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"],
  ["Sinopse", (s) => (s.description ? `${s.description.replace(/<[^>]+>/g, "").slice(0, 400)}${s.description.length > 400 ? "…" : ""}` : "—")],
];

/** Admin → Correspondências → detalhe (Fase 6): os dois registros lado a lado, o impacto de confirmar e as decisões. */
export default async function AdminCorrespondencePage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const { kind, id } = await params;
  if (kind !== "import" && kind !== "anidb") notFound();
  const row = await loadCorrespondence(kind as CorrespondenceKind, id);
  if (!row) notFound();
  const [impact, decisions] = await Promise.all([
    correspondenceImpact(row),
    prisma.adminLog.findMany({ where: { context: `Correspondências · ${row.key}` }, orderBy: { at: "desc" }, take: 20 }),
  ]);
  const candidate = row.candidate;

  return (
    <>
      <AdminPageHeader
        title={row.received.titleNative ?? row.received.titleRomaji ?? row.id}
        subtitle={`${row.sourceLabel} · similaridade ${row.score !== null ? `${Math.round(row.score * 100)}%` : "—"} · ${row.reason}`}
        action={<AdminButtonLink href="/admin/correspondencias">Todas as correspondências</AdminButtonLink>}
      />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }} data-testid="correspondence-chips">
        {row.matching.map((m) => <SmallChip key={m} tone="success">{`coincide: ${m}`}</SmallChip>)}
        {row.diverging.map((d) => <SmallChip key={d} tone="warning">{`diverge: ${DIVERGENCES[d].toLowerCase()}`}</SmallChip>)}
        {row.risky && <SmallChip tone="warning">Risco: confirmar exige motivo</SmallChip>}
      </Box>

      <AdminPanel title="Lado a lado" testId="correspondence-compare">
        <Box sx={{ overflowX: "auto" }}>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { textAlign: "left", p: 1, borderTop: 1, borderColor: "divider", verticalAlign: "top", fontSize: 14 } }}>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Recebido</th>
                <th>Candidato</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, get]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{get(row.received)}</td>
                  <td style={{ overflowWrap: "anywhere" }}>{candidate ? get(candidate) : "Sem candidato"}</td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
        {candidate?.catalogEntryId && <AdminButtonLink href={`/admin/obras/${candidate.catalogEntryId}`}>Abrir a obra candidata</AdminButtonLink>}
      </AdminPanel>

      <AdminPanel title="O que muda ao confirmar" testId="correspondence-impact">
        <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 14 }}>
          {impact.effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </Box>
        {impact.target && (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Destino: {impact.target.exists ? (impact.target.onPlatform ? "na plataforma" : "só no cache") : "fora do catálogo"} · {impact.target.followers} seguidor(es) · {impact.target.episodes} episódio(s) · {impact.target.productions} página(s)
          </Typography>
        )}
      </AdminPanel>

      <AdminPanel title="Decisão" testId="correspondence-decision">
        <CorrespondenceActions kind={row.kind} id={row.id} risky={row.risky} pending={row.state !== "decidida"} allowLater={row.kind === "anidb" && row.state === "pendente"} />
      </AdminPanel>

      <AdminPanel title="Decisões anteriores" testId="correspondence-history">
        {decisions.length === 0 && !row.decidedAt ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma decisão registrada.</Typography>
        ) : (
          <AdminTable
            caption="Decisões"
            rows={[...(row.decidedAt && decisions.length === 0 ? [{ id: "state", at: new Date(row.decidedAt), message: `${row.rawState}`, adminName: row.decidedBy }] : []), ...decisions.map((d) => ({ id: d.id, at: d.at, message: d.message, adminName: d.adminName }))]}
            rowKey={(r) => r.id}
            columns={[
              { key: "t", label: "Quando", render: (r) => <span suppressHydrationWarning>{fmtFull(r.at, timeZone)}</span> },
              { key: "a", label: "Quem", render: (r) => r.adminName ?? "—" },
              { key: "m", label: "Decisão", render: (r) => r.message },
            ]}
          />
        )}
      </AdminPanel>
    </>
  );
}
